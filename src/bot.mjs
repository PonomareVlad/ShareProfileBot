import { createHash } from 'node:crypto'
import { Bot, InputFile } from 'grammy'

export const {

    // Telegram bot token from t.me/BotFather
    TELEGRAM_BOT_TOKEN,

    // Secret token to validate incoming updates
    TELEGRAM_SECRET_TOKEN = String(TELEGRAM_BOT_TOKEN).split(':').pop(),

} = process.env

export const token = TELEGRAM_BOT_TOKEN
export const secretToken = TELEGRAM_SECRET_TOKEN

const PHOTO_FILE_IDS = new Map()

const createResultId = value => createHash('sha256').update(value).digest('hex')
const getValueByPath = (value, path) => path.split('.').reduce((result, key) => (key && result && typeof result === 'object' && Object.hasOwn(result, key) ? result[key] : undefined), value)
const isPhoto = value => Boolean(value && typeof value === 'object' && (typeof value.big_file_id === 'string' || typeof value.small_file_id === 'string'))
const formatValue = value => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)).slice(0, 4000)

const getPhotoFileId = async (api, userId, photo) => {
    const sourceFileId = photo.big_file_id || photo.small_file_id
    if (PHOTO_FILE_IDS.has(sourceFileId)) return PHOTO_FILE_IDS.get(sourceFileId)
    const { file_path } = await api.getFile(sourceFileId)
    const message = await api.sendPhoto(userId, new InputFile(new URL(`https://api.telegram.org/file/bot${token}/${file_path}`)), { disable_notification: true })
    const photoFileId = message.photo.at(-1).file_id
    PHOTO_FILE_IDS.set(sourceFileId, photoFileId)
    void api.deleteMessage(userId, message.message_id).catch(() => {})
    return photoFileId
}

export const bot = new Bot(token)

bot.command('start', ctx =>
    ctx.reply('В любом чате напиши `@ShareProfileBot first_name` или `@ShareProfileBot photo`.', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                { text: 'Имя', switch_inline_query_current_chat: 'first_name' },
                { text: 'Фото', switch_inline_query_current_chat: 'photo' },
            ]],
        },
    })
)

bot.on('inline_query', async ctx => {
    const query = ctx.inlineQuery.query.trim()
    if (!query) return ctx.answerInlineQuery([], { cache_time: 0, is_personal: true })
    const value = getValueByPath(await ctx.api.getChat(ctx.from.id), query)
    if (value === undefined) return ctx.answerInlineQuery([], { cache_time: 0, is_personal: true })
    return ctx.answerInlineQuery([isPhoto(value)
        ? { type: 'photo', id: createResultId(query), photo_file_id: await getPhotoFileId(ctx.api, ctx.from.id, value) }
        : { type: 'article', id: createResultId(query), title: query, description: formatValue(value).slice(0, 128), input_message_content: { message_text: formatValue(value) } }], { cache_time: 0, is_personal: true })
})
