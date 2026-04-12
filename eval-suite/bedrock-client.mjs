/**
 * AWS Bedrock client for visual evaluation using Nova Lite
 *
 * Sends screenshots to Nova Lite for perceptual pass/fail evaluation.
 * Uses the scrible-dev AWS profile for credentials.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';

export class BedrockClient {
  constructor(profileName = 'scrible-dev') {
    this.client = new BedrockRuntimeClient({
      region: 'us-east-1',
      credentials: fromIni({ profile: profileName }),
    });
    this.modelId = 'us.amazon.nova-lite-v1:0';
  }

  /**
   * Evaluate a screenshot against expected outcomes.
   * @param {string} screenshotBase64 - Base64 encoded PNG screenshot
   * @param {string} expectedOutcome - Natural language description of what should be visible
   * @returns {Promise<{pass: boolean, reason: string}>}
   */
  async evaluateScreenshot(screenshotBase64, expectedOutcome) {
    const prompt = `You are evaluating a screenshot of a web-based outline editor.

Examine the screenshot carefully and determine whether the following expected outcomes are met.

EXPECTED OUTCOMES:
${expectedOutcome}

Respond with a JSON object (and nothing else):
{
  "pass": true or false,
  "reason": "Brief explanation of what you see that confirms or contradicts the expected outcomes"
}

Be strict but fair. If the expected outcome is mostly met with minor styling differences, that's a pass. If key functional requirements are missing (wrong order, missing elements, broken layout), that's a fail.`;

    try {
      const body = JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                image: {
                  format: 'png',
                  source: { bytes: screenshotBase64 },
                },
              },
              { text: prompt },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 500,
          temperature: 0,
        },
      });

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body,
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Extract the text response
      const text = responseBody.output?.message?.content?.[0]?.text || '';

      // Parse JSON from response — handle truncated or malformed JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          return { pass: !!result.pass, reason: result.reason || '' };
        } catch {
          // JSON was truncated — check if pass: true appears in the text
          const passMatch = text.match(/"pass"\s*:\s*(true|false)/);
          if (passMatch) {
            return { pass: passMatch[1] === 'true', reason: 'Response truncated but pass value extracted' };
          }
        }
      }

      return { pass: false, reason: `Could not parse LLM response: ${text.substring(0, 200)}` };
    } catch (error) {
      return { pass: false, reason: `Bedrock API error: ${error.message}` };
    }
  }
}
