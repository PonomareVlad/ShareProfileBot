import mime from 'mime/lite'
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

const get = (object, path) =>
    path
        .split('.')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((object, key) => object?.[key], object)

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
        case typeof result === 'object' && 'file_id' in result: {
            const { file_path } = await ctx.api.getFile(result.file_id)
            switch (mime.getType(file_path)?.split('/').at(0)) {
                case 'image': {
                    results.push(
                        InlineQueryResultBuilder.photoCached(
                            query,
                            result.file_id
                        )
                    )
                    break
                }
                case 'video': {
                    results.push(
                        InlineQueryResultBuilder.videoCached(
                            query,
                            result.file_id,
                            result.file_id
                        )
                    )
                    break
                }
                case 'audio': {
                    results.push(
                        InlineQueryResultBuilder.audioCached(
                            query,
                            result.file_id
                        )
                    )
                    break
                }
                default: {
                    results.push(
                        InlineQueryResultBuilder.documentCached(
                            query,
                            result.file_id,
                            result.file_id
                        )
                    )
                    break
                }
            }
            break
        }
        case typeof result === 'object' && 'big_file_id' in result: {
            console.log(await ctx.api.getFile(result.big_file_id))
            results.push(
                InlineQueryResultBuilder.photoCached(query, result.big_file_id)
            )
            break
        }
        case typeof result === 'string' && query.endsWith('file_id'): {
            const { file_path } = await ctx.api.getFile(result)
            switch (mime.getType(file_path)?.split('/').at(0)) {
                case 'image': {
                    results.push(
                        InlineQueryResultBuilder.photoCached(query, result)
                    )
                    break
                }
                case 'video': {
                    results.push(
                        InlineQueryResultBuilder.videoCached(
                            query,
                            result,
                            result
                        )
                    )
                    break
                }
                case 'audio': {
                    results.push(
                        InlineQueryResultBuilder.audioCached(query, result)
                    )
                    break
                }
                default: {
                    results.push(
                        InlineQueryResultBuilder.documentCached(
                            query,
                            result,
                            result
                        )
                    )
                    break
                }
            }
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
