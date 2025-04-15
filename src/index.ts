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
import fetch from 'node-fetch';

const schema = {
	"name": "recipe",
	"schema": {
		"type": "object",
		"properties": {
			"name": {
				"type": "string",
				"description": "The name of the recipe."
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
						"amount",
						"description"
					],
					"additionalProperties": false
				}
			},
			"instructions": {
				"type": "array",
				"description": "Step-by-step instructions to prepare the recipe.",
				"items": {
					"type": "string",
					"description": "A single step in the recipe's preparation."
				}
			}
		},
			"required": [
				"name",
				"description",
				"ingredients",
				"instructions"
			],
			"additionalProperties": false
		},
		"strict": true
	};

	async function getRecipeFromAI(openai: OpenAI, foodName: string | null) {
		if (!foodName) {
	return new Response(JSON.stringify({ error: "foodName parameter is required" }), {
		status: 400,
		headers: { 'Content-Type': 'application/json' },
	});
}

try {
	const chatCompletion = await openai.chat.completions.create({
		response_format: { "type": "json_schema", "json_schema": schema },
		store: true,
		messages: [
			{ role: "system", content: "please give me a promising recipe, it can be from famous chefs. it should be detailed with all tips and tricks." },
			{ role: "user", content: `recipe of ${foodName}` }
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
		return new Response(JSON.stringify(JSON.parse(recipeResponse.content), null, 2), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} else {
		throw new Error("No response content");
	}

} catch (e: unknown) {
	return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'An unknown error occurred' }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

}

async function getImageFromWeb(foodOrIngName: string | null, env: Env) {
	if (!foodOrIngName) {
		return new Response(JSON.stringify({ error: "foodOrIngName parameter is required" }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		interface GoogleSearchResponse {
			items?: Array<{
				link: string;
				image: {
					thumbnailLink: string;
				}
			}>;
		}

		const response = await fetch(
			`https://www.googleapis.com/customsearch/v1?key=${(env as { GOOGLE_API_KEY: string }).GOOGLE_API_KEY}&cx=${(env as { GOOGLE_CSE_ID: string }).GOOGLE_CSE_ID}&q=${encodeURIComponent(foodOrIngName)}&searchType=image`
		);

		if (!response.ok) {
			throw new Error(`Google API error: ${response.status}`);
		}

		const data = await response.json() as GoogleSearchResponse;
		if (!data.items?.length) {
			throw new Error("No results found on Google");
		}

		const { link, image: { thumbnailLink } } = data.items[0];

		return new Response(JSON.stringify({ url: link, thumb: thumbnailLink }, null, 2), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (e: unknown) {
		return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'An unknown error occurred' }, null, 2), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};
		const url = new URL(request.url);
		if (url.pathname === '/getRecipe') {
			const openai = new OpenAI({
				baseURL: "https://models.inference.ai.azure.com",
				apiKey: (env as { GITHUB_TOKEN: string }).GITHUB_TOKEN,
			});
			const foodName = url.searchParams.get("foodName");
			const response = await getRecipeFromAI(openai, foodName);
			return new Response(response.body, {
				headers: { ...corsHeaders, ...response.headers }
			});
		}
		if (url.pathname === '/getImage') {
			const foodOrIngName = url.searchParams.get("foodOrIngName");
			const response = await getImageFromWeb(foodOrIngName, env);

			return new Response(response.body, {
				headers: { ...corsHeaders, ...response.headers }
			});
		}
		return new Response('Not found', { status: 404, headers: corsHeaders });

	},
} satisfies ExportedHandler<Env>;
