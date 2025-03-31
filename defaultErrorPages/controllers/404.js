const fs = require('fs-extra')
const path = require('path')
const template = require('../../lib/tools/templateLiteralRenderer')
const errorPage = fs.readFileSync(path.join(__dirname, '../views/404.html'))

module.exports = app => {
  app.route('*all').all(function (req, res) {
    const model = {
      url: req.url,
      mainDomain: req.headers['x-forwarded-host'] || req.headers.host,
      appVersion: req.app.get('appVersion')
    }
    let errorTemplate = template(errorPage, model)
    if (process.env.NODE_ENV === 'development' && req.app.get('routes').length) errorTemplate = errorTemplate.replace('</footer>', `${req.app.get('debugMarkup')}</footer>`)
    res.status(404)
    res.send(errorTemplate)
  })
}
