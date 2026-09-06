import { hydrateFiles } from '@grammyjs/files'
import { Bot, InlineKeyboard, InlineQueryResultBuilder } from 'grammy'

export const {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_SECRET_TOKEN: secretToken = String(token).split(':').pop(),
    TELEGRAM_API_ROOT: apiRoot,
} = process.env

export const bot = /** @type {Bot<BotContext, BotApi>} */ new Bot(token)

bot.api.config.use(hydrateFiles(token, { apiRoot }))

const safe = bot.errorBoundary(console.error)

const get = (object, path) =>
    path.split('.').reduce((object, key) => object?.[key], object)

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
    Object.assign(
        ctx.chat,
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
    const result = get(ctx.chat, query)
    const results = []
    switch (true) {
        case 'big_file_id' in result: {
            const file = await ctx.api.getFile(result.big_file_id)
            results.push(InlineQueryResultBuilder.photo(query, file.getUrl()))
            break
        }
        case query.endsWith('.big_file_id') && typeof result === 'string': {
            const file = await ctx.api.getFile(result)
            results.push(InlineQueryResultBuilder.photo(query, file.getUrl()))
            break
        }
        case ['string', 'number'].includes(typeof result): {
            results.push(
                InlineQueryResultBuilder.article(query, result, {
                    description: result,
                })
            )
            break
        }
        default: {
            results.push(
                InlineQueryResultBuilder.article(query, typeof result, {
                    description: JSON.stringify(result),
                })
            )
            break
        }
    }
    return ctx.answerInlineQuery(results, {
        button: { text: 'Разрешите боту доступ к вашим данным' },
        is_personal: true,
        cache_time: 0,
    })
})
