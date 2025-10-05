import { OpenAI } from 'openai';

const client = new OpenAI({
  baseURL: 'https://router.huggingface.co/v1',
  apiKey: process.env.HF_TOKEN,
});

export async function getChatResponse(userMessage: string) {
  const chatCompletion = await client.chat.completions.create({
    model: 'meta-llama/Llama-3.1-8B-Instruct:nebius',
    messages: [
  { role: 'system', content: 'Reply concisely, with a bit of sarcasm and humor. Limit your answer to 4 sentences max. You are also being used in a discord server as a bot, a StrengthBot to be specific' },
      { role: 'user', content: userMessage }
    ],
  });
  return chatCompletion.choices[0].message.content;
}
