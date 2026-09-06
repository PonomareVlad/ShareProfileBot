import { Mime } from 'mime/lite'
import otherTypes from 'mime/types/other.js'
import standardTypes from 'mime/types/standard.js'
// import { hydrateFiles } from '@grammyjs/files'
import { Bot, InlineKeyboard, InlineQueryResultBuilder } from 'grammy'

export const {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_SECRET_TOKEN: secretToken = String(token).split(':').pop(),
    TELEGRAM_API_ROOT: apiRoot,
} = process.env

export const bot = /** @type {Bot<BotContext, BotApi>} */ new Bot(token)

// bot.api.config.use(hydrateFiles(token, { apiRoot }))

const safe = bot.errorBoundary(console.error)

const mime = new Mime(standardTypes, otherTypes, {
    'sticker/x-tgsticker': ['tgs'],
})

const get = (object, path) =>
    path
        .split('.')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((object, key) => object?.[key], object)

const toInlineAttachmentResult = (query, file_id, file_path = '') => {
    const normalizedQuery = query.toLowerCase()
    const hasAttachment = name =>
        normalizedQuery === name ||
        normalizedQuery.includes(`.${name}.`) ||
        normalizedQuery.endsWith(`.${name}`)
    const mime_type = mime.getType(file_path)
    const mime_kind = mime_type?.split('/').at(0)
    switch (true) {
        case hasAttachment('sticker'): {
            return InlineQueryResultBuilder.stickerCached(query, file_id)
        }
        case hasAttachment('voice'): {
            return InlineQueryResultBuilder.voiceCached(query, query, file_id)
        }
        case hasAttachment('animation') && mime_type === 'image/gif': {
            return InlineQueryResultBuilder.gifCached(query, file_id)
        }
        case hasAttachment('animation') && mime_type === 'video/mp4': {
            return InlineQueryResultBuilder.mpeg4gifCached(query, file_id)
        }
        case hasAttachment('photo') || mime_kind === 'image': {
            return InlineQueryResultBuilder.photoCached(query, file_id)
        }
        case hasAttachment('video') || hasAttachment('video_note') || mime_kind === 'video': {
            return InlineQueryResultBuilder.videoCached(query, query, file_id)
        }
        case hasAttachment('audio') || mime_kind === 'audio': {
            return InlineQueryResultBuilder.audioCached(query, file_id)
        }
        default: {
            return InlineQueryResultBuilder.documentCached(query, query, file_id)
        }
    }
}

safe.command('start', ctx =>
    ctx.reply('Демо:', {
        reply_markup: new InlineKeyboard()
            .switchInlineCurrent('Имя', 'first_name')
            .switchInlineCurrent('Фамилия', 'last_name')
            .switchInlineCurrent('О себе', 'bio')
            .switchInlineCurrent('День рождения', 'birthdate')
            .switchInlineCurrent('Фото', 'photo')
            .toFlowed(1),
    })
)

safe.on('inline_query', async ctx => {
    const profile = Object.assign(
        {},
        ctx.from,
        await ctx.api.getChat(ctx.from.id).catch(() => {}),
        {
            photos: await ctx.api
                .getUserProfilePhotos(ctx.from.id)
                .catch(() => ({})),
            audios: await ctx.api
                .getUserProfileAudios(ctx.from.id)
                .catch(() => ({})),
            messages: await ctx.api
                .getUserPersonalChatMessages(ctx.from.id, 20)
                .catch(() => []),
            gifts: await ctx.api.getUserGifts(ctx.from.id).catch(() => ({})),
        }
    )
    const query = ctx.inlineQuery.query.trim()
    const result = get(profile, query)
    console.log(query, result)
    const results = []
    switch (true) {
        case Boolean(result) &&
            typeof result === 'object' &&
            'file_id' in result: {
            const { file_path } = await ctx.api.getFile(result.file_id)
            console.log(mime.getType(file_path), file_path)
            results.push(
                toInlineAttachmentResult(query, result.file_id, file_path)
            )
            break
        }
        case Boolean(result) &&
            typeof result === 'object' &&
            'big_file_id' in result: {
            console.log(await ctx.api.getFile(result.big_file_id))
            results.push(
                InlineQueryResultBuilder.photoCached(query, result.big_file_id)
            )
            break
        }
        case Boolean(result) &&
            typeof result === 'object' &&
            'latitude' in result &&
            'longitude' in result: {
            results.push(
                InlineQueryResultBuilder.location(
                    query,
                    query,
                    result.latitude,
                    result.longitude
                )
            )
            break
        }
        case typeof result === 'string' && query.endsWith('file_id'): {
            const { file_path } = await ctx.api.getFile(result)
            console.log(mime.getType(file_path), file_path)
            results.push(toInlineAttachmentResult(query, result, file_path))
            break
        }
        case ['string', 'number', 'undefined'].includes(typeof result): {
            results.push(
                InlineQueryResultBuilder.article(query, String(result), {
                    description: String(result),
                }).text(String(result))
            )
            break
        }
        default: {
            results.push(
                InlineQueryResultBuilder.article(query, typeof result, {
                    description: JSON.stringify(result),
                }).text(JSON.stringify(result))
            )
            break
        }
    }
    console.log(results)
    return ctx.answerInlineQuery(results, {
        button: {
            text: 'Разрешите боту доступ к вашим данным',
            start_parameter: '_',
        },
        is_personal: true,
        cache_time: 0,
    })
})
