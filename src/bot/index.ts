import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN!;
const TIMEZONE_OFFSET = 3;
const DATA_PATH = path.resolve(__dirname, 'reminders.json');

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is missing');

const bot = new Telegraf(BOT_TOKEN);
const reminders: Record<string, Reminder[]> = loadReminders();
const sentToday: Set<string> = new Set();

type Reminder = {
  userTag: string;
  schedule: string; // e.g. "every weekday"
};

function loadReminders(): Record<string, Reminder[]> {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveReminders() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(reminders, null, 2));
}

function normalizeSchedule(schedule: string): string {
  return schedule
    .toLowerCase()
    .replace(/monday/g, 'mon')
    .replace(/tuesday/g, 'tue')
    .replace(/wednesday/g, 'wed')
    .replace(/thursday/g, 'thu')
    .replace(/friday/g, 'fri')
    .replace(/saturday/g, 'sat')
    .replace(/sunday/g, 'sun');
}

function shouldSendReminder(schedule: string, date: Date): boolean {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ...
  const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const normalized = normalizeSchedule(schedule);

  if (normalized === 'every day') return true;
  if (normalized === 'every weekday') return day >= 1 && day <= 5;
  if (normalized.startsWith('every ')) return normalized.includes(dayMap[day]);
  if (dayMap.includes(normalized)) return normalized === dayMap[day];
  return false;
}

// 🕘 Reminder check every minute
setInterval(() => {
  const now = new Date();
  const hour = now.getUTCHours() + TIMEZONE_OFFSET;
  const minute = now.getUTCMinutes();

  if (hour === 17 && minute === 0) {
    Object.entries(reminders).forEach(([chatId, list]) => {
      const key = `${chatId}_${now.toDateString()}`;
      if (sentToday.has(key)) return;

      list.forEach(reminder => {
        if (shouldSendReminder(reminder.schedule, now)) {
          bot.telegram.sendMessage(chatId, `@${reminder.userTag}, не забудь про отчет`);
          sentToday.add(key);
        }
      });
    });
  }
}, 60 * 1000);

// 📩 Message handler
bot.on('text', ctx => {
  const chatId = String(ctx.chat.id);
  const text = ctx.message.text.trim();

  if (text.includes('@izi_reminder_bot отчет')) {
    const key = `${chatId}_${new Date().toDateString()}`;
    sentToday.add(key);
  }

  if (text.includes('@izi_reminder_bot сброс')) {
    reminders[chatId] = [];
    saveReminders();
    ctx.reply('Все отслеживаемые отчеты сброшены.');
  }

  if (text.includes('@izi_reminder_bot список')) {
    const list = reminders[chatId] || [];
    if (list.length === 0) return ctx.reply('Нет активных напоминаний.');
    const msg = list.map(r => `@${r.userTag} — ${r.schedule}`).join('\n');
    ctx.reply(msg);
  }

  if (text.startsWith('@izi_reminder_bot добавить')) {
    const parts = text.split(' ').filter(Boolean);
    const userTag = parts[2];
    const schedule = parts.slice(3).join(' ');

    if (!userTag || !schedule) {
      return ctx.reply('Формат: @izi_reminder_bot добавить <user> <schedule>');
    }

    const normalized = normalizeSchedule(schedule);
    const list = reminders[chatId] || [];
    list.push({ userTag, schedule: normalized });
    reminders[chatId] = list;
    saveReminders();
    ctx.reply(`Добавлено: @${userTag} — ${normalized}`);
  }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
