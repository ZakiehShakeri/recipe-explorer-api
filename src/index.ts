/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import OpenAI from "openai";
import * as cheerio from "cheerio";

const schema = {
	"name": "recipe",
	"schema": {
		"type": "object",
		"properties": {
			"name": {
				"type": "string",
				"description": "The name of the recipe."
			},
			"imgUrl": {
				"type": "string",
				"description": "The URL of the recipe image."
			},
			"description": {
				"type": "string",
				"description": "A brief description of the recipe."
			},
			"ingredients": {
				"type": "array",
				"description": "A list of ingredients for the recipe.",
				"items": {
					"type": "object",
					"properties": {
						"name": {
							"type": "string",
							"description": "The name of the ingredient."
						},
						"imgUrl": {
							"type": "string",
							"description": "The URL of the ingredient image."
						},
						"amount": {
							"type": "string",
							"description": "The amount of the ingredient required."
						},
						"description": {
							"type": "string",
							"description": "A description of the ingredient."
						}
					},
					"required": [
						"name",
						"imgUrl",
						"amount",
						"description"
					],
					"additionalProperties": false
				}
			},
			"instructions": {
				"type": "string",
				"description": "The instructions for preparing the recipe."
			}
		},
		"required": [
			"name",
			"imgUrl",
			"description",
			"ingredients",
			"instructions"
		],
		"additionalProperties": false
	},
	"strict": true
};

async function getRecipeFromAI(openai: OpenAI, recipeName: string) {
	try {
		const chatCompletion = await openai.chat.completions.create({
			response_format: { "type": "json_schema", "json_schema": schema },
			store: true,
			messages: [
				{ role: "system", content: "you are a professional chef. please give me promising recipes. " },
				{ role: "user", content: `recipe of ${recipeName}` }
			],
			model: "gpt-4o",
			temperature: 1,
			max_tokens: 4096,
			top_p: 1
		});

		if (chatCompletion.choices[0].finish_reason === "length") {
			// Handle the case where the model did not return a complete response
			throw new Error("Incomplete response");
		}

		const recipeResponse = chatCompletion.choices[0].message;

		if (recipeResponse.refusal) {
			throw new Error("Model refused to provide a recipe");

		} else if (recipeResponse.content) {
			return JSON.parse(recipeResponse.content);
		} else {
			throw new Error("No response content");
		}

	} catch (e: unknown) {
		return { error: e instanceof Error ? e.message : 'An unknown error occurred' };
	}

}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const openai = new OpenAI({
			baseURL: "https://models.inference.ai.azure.com",
			apiKey: (env as { GITHUB_TOKEN: string }).GITHUB_TOKEN,
		});
		const url = new URL(request.url);
		const foodName = url.searchParams.get("foodName");

		if (!foodName) {
			return new Response(JSON.stringify({ error: "foodName parameter is required" }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const recipe = await getRecipeFromAI(openai, foodName);
		return new Response(JSON.stringify(recipe, null, 2), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	},
} satisfies ExportedHandler<Env>;
