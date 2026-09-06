import { createHash } from 'node:crypto'
import { Bot } from 'grammy'

const INLINE_QUERY_EXAMPLES = ['first_name', 'bio', 'photo', 'birthdate', 'business_location.location']

export const {

    // Telegram bot token from t.me/BotFather
    TELEGRAM_BOT_TOKEN,

    // Secret token to validate incoming updates
    TELEGRAM_SECRET_TOKEN = String(TELEGRAM_BOT_TOKEN).split(':').pop(),

} = process.env

export const token = TELEGRAM_BOT_TOKEN
export const secretToken = TELEGRAM_SECRET_TOKEN

const createSwitchInlineButton = (text, query) => ({
    text,
    switch_inline_query: query,
})

const formatInlineExample = (username, query) => `@${username} ${query}`

const createExampleResult = (username, query) => ({
    type: 'article',
    id: createResultId(`example:${query}`),
    title: `Пример: ${query}`,
    description: `Вставить ${formatInlineExample(username, query)} в выбранный чат`,
    input_message_content: {
        message_text: formatInlineExample(username, query),
    },
})

const getValueByPath = (value, path) => {
    const keys = path.split('.')

    if (keys.some(key => !key)) {
        return undefined
    }

    return keys.reduce((result, key) => (result && typeof result === 'object' && Object.hasOwn(result, key) ? result[key] : undefined), value)
}

const getDisplayName = chat => [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title

const resolveQueryValue = (chat, query) => {
    const value = getValueByPath(chat, query)

    if (value !== undefined) {
        return {
            path: query,
            value,
        }
    }

    switch (query) {
        case 'name':
            return {
                path: query,
                value: getDisplayName(chat),
            }
        case 'birthday':
        case 'bithday':
            return {
                path: 'birthdate',
                value: chat.birthdate,
            }
        default:
            return {
                path: query,
                value: undefined,
            }
    }
}

const formatValue = value => {
    if (typeof value === 'string') {
        return value
    }

    if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value, null, 2)
    }

    return String(value)
}

const trimText = (text, maxLength = 4000) =>
    text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text

const createResultId = prefix => createHash('sha256').update(prefix).digest('hex')
const REUPLOADED_CHAT_PHOTO_IDS = new Map()

const isChatNotFoundError = error =>
    Boolean(
        error &&
            typeof error === 'object' &&
            'error_code' in error &&
            error.error_code === 400 &&
            'description' in error &&
            typeof error.description === 'string' &&
            error.description.includes('chat not found')
    )

const isChatPhoto = value =>
    Boolean(
        value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            (typeof value.big_file_id === 'string' || typeof value.small_file_id === 'string')
    )

const getTelegramFileUrl = filePath => `https://api.telegram.org/file/bot${token}/${filePath}`

const getReuploadedPhotoFileId = async (api, userId, photo) => {
    const sourceFileId = photo.big_file_id || photo.small_file_id

    if (REUPLOADED_CHAT_PHOTO_IDS.has(sourceFileId)) {
        return REUPLOADED_CHAT_PHOTO_IDS.get(sourceFileId)
    }

    const { file_path } = await api.getFile(sourceFileId)
    const message = await api.sendPhoto(userId, getTelegramFileUrl(file_path), { disable_notification: true })
    const reuploadedPhotoFileId = message.photo?.at(-1)?.file_id

    if (!reuploadedPhotoFileId) {
        throw new Error('Failed to reupload chat photo')
    }

    REUPLOADED_CHAT_PHOTO_IDS.set(sourceFileId, reuploadedPhotoFileId)

    try {
        await api.deleteMessage(userId, message.message_id)
    } catch {}

    return reuploadedPhotoFileId
}

const createProfileResult = async (api, userId, path, value) => {
    const title = `Профиль: ${path}`

    if (isChatPhoto(value)) {
        return {
            type: 'photo',
            id: createResultId(`photo:${path}`),
            photo_file_id: await getReuploadedPhotoFileId(api, userId, value),
            title,
            description: 'Фото из Telegram профиля',
            caption: title,
        }
    }

    const text = trimText(formatValue(value))

    return {
        type: 'article',
        id: createResultId(`article:${path}`),
        title,
        description: trimText(text, 128),
        input_message_content: {
            message_text: text,
        },
    }
}

const createNotFoundResult = (username, query, chat) => ({
    type: 'article',
    id: createResultId(`missing:${query}`),
    title: `Поле не найдено: ${query}`,
    description: `Доступные верхнеуровневые поля: ${Object.keys(chat).slice(0, 8).join(', ')}`,
    input_message_content: {
        message_text: trimText(
            [
                `Не удалось найти поле "${query}".`,
                '',
                'Попробуй другое поле или путь через точку, например:',
                ...INLINE_QUERY_EXAMPLES.map(example => formatInlineExample(username, example)),
            ].join('\n')
        ),
    },
})

const createStartMessage = username =>
    [
        'Привет! Я умею вытаскивать данные из твоего Telegram-профиля в inline-режиме.',
        '',
        'Просто напиши в любом чате:',
        ...INLINE_QUERY_EXAMPLES.map(example => formatInlineExample(username, example)),
        '',
        'Поддерживаются и вложенные пути через точку, например `photo.big_file_id`.',
        'Если поле является объектом, я отправлю его как JSON.',
    ].join('\n')

const START_KEYBOARD = {
    inline_keyboard: [
        [
            createSwitchInlineButton('Имя', 'first_name'),
            createSwitchInlineButton('Био', 'bio'),
            createSwitchInlineButton('Фото', 'photo'),
        ],
        [
            createSwitchInlineButton('Дата рождения', 'birthdate'),
            createSwitchInlineButton('Локация бизнеса', 'business_location.location'),
        ],
    ],
}

// Default grammY bot instance
export const bot = new Bot(token)

bot.command('start', ctx =>
    ctx.reply(createStartMessage(ctx.me.username), {
        parse_mode: 'Markdown',
        reply_markup: START_KEYBOARD,
    })
)

bot.on('inline_query', async ctx => {
    const query = ctx.inlineQuery.query.trim()

    if (!query) {
        return ctx.answerInlineQuery(INLINE_QUERY_EXAMPLES.map(example => createExampleResult(ctx.me.username, example)), {
            cache_time: 0,
            is_personal: true,
        })
    }

    let chat

    try {
        chat = await ctx.api.getChat(ctx.from.id)
    } catch (error) {
        if (!isChatNotFoundError(error)) {
            throw error
        }

        return ctx.answerInlineQuery(
            [
                {
                    type: 'article',
                    id: 'start-required',
                    title: 'Сначала открой личный чат с ботом',
                    description: 'Напиши /start, чтобы бот получил доступ к данным твоего профиля.',
                    input_message_content: {
                        message_text: `Сначала открой личный чат с @${ctx.me.username} и отправь команду /start.`,
                    },
                },
            ],
            {
                cache_time: 0,
                is_personal: true,
            }
        )
    }

    const { path, value } = resolveQueryValue(chat, query)

    return ctx.answerInlineQuery(
        [
            value === undefined
                ? createNotFoundResult(ctx.me.username, query, chat)
                : await createProfileResult(ctx.api, ctx.from.id, path, value),
        ],
        {
            cache_time: 0,
            is_personal: true,
        }
    )
})
