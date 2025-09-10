import { Telegraf } from 'telegraf';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN!;
const TIMEZONE_OFFSET = 3;

if (!BOT_TOKEN) throw new Error('The required environment variable BOT_TOKEN or NOTIFY_CHAT_ID is missing');

const bot = new Telegraf(BOT_TOKEN);

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
