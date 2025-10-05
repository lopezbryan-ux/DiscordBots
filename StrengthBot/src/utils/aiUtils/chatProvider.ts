import { OpenAI } from 'openai';

const client = new OpenAI({
  baseURL: 'https://router.huggingface.co/v1',
  apiKey: process.env.HF_TOKEN,
});

export async function getChatResponse(userMessage: string) {
  const chatCompletion = await client.chat.completions.create({
    model: 'meta-llama/Llama-3.1-8B-Instruct:nebius',
    messages: [
      {
        role: 'system',
        content:
          'You are a StrengthBot for a discord server focused on strength training, powerlifting, and general fitness. You provide accurate information based on established fitness principles and research. If you do not know the answer, respond with "I do not know" or "I am not sure". Never make up information or provide false details. And give no sugar coated responses tell the user what they need to hear. Also have a low level of sarcasm and humor in your responses.',
      },
      { role: 'user', content: userMessage },
    ],
  });
  return chatCompletion.choices[0].message.content;
}
