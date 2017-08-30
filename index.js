const mineflayer = require('mineflayer')
const program = require('commander')
const package = require('./package.json')
const log = require('npmlog')
const fs = require('fs')
const co = require('co')
const prompt = require('co-prompt')
const password = prompt.password
const ygg = require('yggdrasil')()
const connect = require('connect');
const http = require('http');

program
  .version(package.version)
  .option('    --mchost <addr:port>', 'Minecraft server host')
  .option('    --bottysink <addr:port>', 'hangoutbotty sink')
  .option('-u, --username [<username>]', 'Minecraft bot username')
  .option('-p, --password [<password>]', 'Minecraft bot password')
  .option('    --no-autologin', 'Don\'t refresh old client token')
  .option('-d, --debug', 'Debug mode')
  .parse(process.argv)

if (!process.argv.slice(3).length){
  program.help()
}

co(function*() {
    let tokens = program.autologin ? yield new Promise((resolve) => {
      fs.readFile(`${__dirname}/.tokens`, 'utf8', (err, data) =>{
        if (err) return resolve(null)
        resolve(JSON.parse(data))
      })
    }) : null

    if(!tokens){
      program.username = program.username || (yield prompt('username: '))
      program.password = program.password || (yield password('password: '))
      yield new Promise((resolve) => {
        ygg.auth({ user: program.username, pass: program.password }, (err, data) => {
          if (err) {
            log.error('Failed to authenticate with yggdrasil')
            console.trace(err)
            process.exit(-1)
          }
          tokens = data
          resolve()
        })
      })
    } else {
      yield new Promise((resolve) => {
        ygg.refresh(tokens.accessToken, tokens.clientToken, (err, newtoken) => {
          if (err) {
            log.error('Failed to authenticate with yggdrasil')
            console.trace(err)
            fs.unlink(`${__dirname}/.tokens`)
            process.exit(-1)
          }
          tokens.accessToken = newtoken
          resolve()
        })
      })
    }

    fs.writeFile(`${__dirname}/.tokens`, JSON.stringify(tokens, null, 2), 'utf8')
    return tokens
}).then((tokens) => {
  log.info(`minecraft server '${program.mchost}'`)

  let mcHost = program.mchost.split(':')
  const bot = mineflayer.createBot({
    host: mcHost[0],
    port: mcHost[1],
    session: tokens,
    loadInternalPlugins: true,
    verbose: !!program.debug
  })

  let app = connect()
  var bodyParser = require('body-parser')
  app.use(bodyParser.urlencoded({extended: false}))

  bot.once('inject_allowed', () => {
    log.info('bot is the house')

    bot.once('spawn', () => {
      bot.chat('hi this is bot')
    })

    // setup routes
    // TODO: Refator after some module/plugin pattern
    app.use((req, res) => {
      bot.chat('hi from web api')
      res.end('OK')
    });
  })

  bot.once('end', (err) => {
    log.error('bot is gonzo')
    console.trace(err)
    process.exit(-1)
  })

  //create node.js http server and listen on port
  http.createServer(app).listen(3000)
})
