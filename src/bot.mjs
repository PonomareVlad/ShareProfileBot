import { hydrateFiles } from '@grammyjs/files'
import { Bot, InlineKeyboard, InlineQueryResultBuilder } from 'grammy'

export const {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_SECRET_TOKEN: secretToken = String(token).split(':').pop(),
    TELEGRAM_API_ROOT: apiRoot,
} = process.env

export const bot = /** @type {Bot<BotContext, BotApi>} */ new Bot(token)

bot.api.config.use(hydrateFiles(token, { apiRoot }))

const get = (object, path) =>
    path.split('.').reduce((object, key) => object?.[key], object)

bot.command('start', ctx =>
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

bot.on('inline_query', async ctx => {
    Object.assign(ctx.chat, await ctx.getChat().catch(console.warn))
    ctx.chat.photos = await ctx.getUserProfilePhotos().catch(console.warn)
    ctx.chat.audios = await ctx.getUserProfileAudios().catch(console.warn)
    ctx.chat.gifts = await ctx.getUserGifts().catch(console.warn)
    ctx.chat.messages = await ctx
        .getUserPersonalChatMessages()
        .catch(console.warn)
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
