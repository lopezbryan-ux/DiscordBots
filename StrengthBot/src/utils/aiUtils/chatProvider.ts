import { OpenAI } from 'openai';

const client = new OpenAI({
  baseURL: 'https://router.huggingface.co/v1',
  apiKey: process.env.HF_TOKEN,
});

export async function getChatResponse(userMessage: string) {
  const chatCompletion = await client.chat.completions.create({
    model: 'deepseek-ai/DeepSeek-R1:novita',
    messages: [
      {
        role: 'system',
        content:
          'You are a StrengthBot for a discord server focused on strength training, powerlifting, and general fitness. Also have a low level of sarcasm and humor in your responses. Keep responses short and concise and up to 4 sentences max.',
      },
      { role: 'user', content: userMessage },
    ],
  });
  return chatCompletion.choices[0].message.content;
}
