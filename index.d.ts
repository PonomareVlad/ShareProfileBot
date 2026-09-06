import { Api, Composer, Context } from 'grammy'
import { FileApiFlavor, FileFlavor } from '@grammyjs/files'

type BotApi = FileApiFlavor<Api>
type BotContext = FileFlavor<Context>
type BotComposerContext = Composer<BotContext>
