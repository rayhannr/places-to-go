import { Command } from 'commander'
import { registerToolCommands } from './commands'
import { runChat } from './chat'

const program = new Command()

program.name('ptg').description('Places To Go — CLI for your food tracker').version('0.1.0')

program.command('chat').description('Interactive AI chat mode (same persona as web/Telegram)').action(runChat)

registerToolCommands(program)

program.parseAsync(process.argv)
