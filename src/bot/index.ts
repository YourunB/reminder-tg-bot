import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN!;
const DATA_PATH = path.resolve(__dirname, '../../data/reminders.json');
const REPORTS_PATH = path.resolve(__dirname, '../../data/reports.json');

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is missing');

const bot = new Telegraf(BOT_TOKEN);
const reminders: Record<string, Reminder[]> = loadReminders();
const reports: Record<string, string> = loadReports();
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

function loadReports(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveReports() {
  fs.writeFileSync(REPORTS_PATH, JSON.stringify(reports, null, 2));
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

function getChatKey(chatId: number | string, threadId?: number): string {
  return threadId ? `${chatId}:${threadId}` : String(chatId);
}

cron.schedule('0 21 * * *', () => {
  const now = new Date();
  const keyDate = now.toDateString();

  Object.entries(reminders).forEach(([key, list]) => {
    if (reports[key] === keyDate) return;

    const sentKey = `${key}_${keyDate}`;
    if (sentToday.has(sentKey)) return;

    const [chatId, threadId] = key.split(':');
    list.forEach(reminder => {
      if (shouldSendReminder(reminder.schedule, now)) {
        bot.telegram.sendMessage(chatId, `@${reminder.userTag}, не забудь про отчет`, {
          message_thread_id: threadId ? Number(threadId) : undefined
        });
        sentToday.add(sentKey);
      }
    });
  });
}, {
  timezone: 'Europe/Moscow'
});

bot.on('message', ctx => {
  const chatId = String(ctx.chat.id);
  const threadId = 'message_thread_id' in ctx.message ? ctx.message.message_thread_id : undefined;
  const key = getChatKey(chatId, threadId);

  const rawText =
    ('text' in ctx.message && ctx.message.text) ||
    ('caption' in ctx.message && ctx.message.caption) ||
    '';

  const text = rawText.toLowerCase().trim();

  if (text.includes('@izi_reminder_bot отчет')) {
    const keyDate = new Date().toDateString();
    const sentKey = `${key}_${keyDate}`;
    sentToday.add(sentKey);
    reports[key] = keyDate;
    saveReports();
    console.log("✅ Отчет зафиксирован:", key, keyDate);
  }

  if (text.includes('@izi_reminder_bot сброс')) {
    reminders[key] = [];
    saveReminders();
    ctx.reply('Все отслеживаемые отчеты сброшены.');
  }

  if (text.includes('@izi_reminder_bot список')) {
    const list = reminders[key] || [];
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
    const list = reminders[key] || [];
    list.push({ userTag, schedule: normalized });
    reminders[key] = list;
    saveReminders();
    ctx.reply(`Добавлено: @${userTag} — ${normalized}`);
  }

  if (text.includes('@izi_reminder_bot помощь')) {
    ctx.reply(
      `📘 Команды бота @izi_reminder_bot:\n\n` +
      `🟢 Добавить напоминание:\n` +
      `@izi_reminder_bot добавить <user> <schedule>\n` +
      `Пример: @izi_reminder_bot добавить petor every weekday\n\n` +
      `📋 Показать список напоминаний:\n` +
      `@izi_reminder_bot список\n\n` +
      `🗑 Сбросить все напоминания:\n` +
      `@izi_reminder_bot сброс\n\n` +
      `✅ Отметить, что отчет уже был:\n` +
      `@izi_reminder_bot отчет\n\n` +
      `🕒 Поддерживаемые расписания:\n` +
      `\nevery day, \nevery weekday, \nevery mon, tue, wed, thu, fri, sat, sun\n\n` +
      `ℹ️ Напоминания приходят в 21:00, если в этот день не было сообщения "@izi_reminder_bot отчет"`
    );
  }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
