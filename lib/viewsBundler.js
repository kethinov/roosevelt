// expose templates that are available on the server down to the client as well
require('@colors/colors')
const fs = require('fs-extra')
const path = require('path')
const { walk } = require('@nodelib/fs.walk/promises')
const { globSync } = require('glob')
const htmlMinifier = require('html-minifier-terser').minify

module.exports = async app => {
  const fsr = require('./tools/fsr')(app)
  const appName = app.get('appName')
  const logger = app.get('logger')
  const viewsPath = app.get('viewsPath')
  const viewEngine = app.get('view engine')
  const { minify: willMinifyTemplates, exposeAll, enable, allowlist, blocklist, defaultBundle } = app.get('params').clientViews
  const { onClientViewsProcess } = app.get('params')
  let minifyOptions = app.get('params').clientViews.minifyOptions

  if (!enable || !app.get('params').makeBuildArtifacts) return

  // if the clientViews minifyOptions is empty, default back to the html.minifier options
  if (Object.keys(minifyOptions).length === 0) minifyOptions = app.get('params').html.minifier.options

  const bundles = Object.assign({}, allowlist)
  const finalBlocklist = new Set(blocklist) // populate this first by pulling the param, then merging in any additionals found, this is a set to prevent dupes implicitly

  // examine all files in the views directory and determine any allow/blocklist changes based on file decorator comments
  const allViewsFiles = (await walk(viewsPath, { stats: true, entryFilter: item => !finalBlocklist.has(item.path) && !item.stats.isDirectory() })).map(file => file.path)
  const allowlistRegex = /<!--+\s*roosevelt-allowlist\s*([\w-/.]+\.?(js)?)\s*--+>/ // regular expression to grab filename from <!-- roosevelt-allowlist --> tags
  for (const file of allViewsFiles) {
    const templateName = path.relative(viewsPath, file).replace(/\\/g, '/') // windows fix
    const contents = fs.readFileSync(file, 'utf8').trim()
    const templateComment = contents.split('\n')[0]
    if (templateComment.includes('roosevelt-blocklist')) {
      finalBlocklist.add(templateName)
    } else if (templateComment.includes('roosevelt-allowlist')) {
      const regexMatch = allowlistRegex.exec(templateComment)
      if (regexMatch) {
        const bundleNameFromComment = regexMatch[1]
        if (!bundles[bundleNameFromComment]) bundles[bundleNameFromComment] = [templateName]
        else bundles[bundleNameFromComment].push(templateName)
      }
    }
  }

  // expose all views if allowlist is empty and exposeAll is enabled
  if (exposeAll && !Object.keys(bundles).length) bundles[defaultBundle] = '**/**'

  // run through the bundle configuration and build
  for (const bundleName of Object.keys(bundles)) {
    try {
      const bundleGlob = bundles[bundleName]
      const bundleFiles = globSync(bundleGlob, { nodir: true, ignore: [...finalBlocklist], cwd: viewsPath })
      const bundleDataStructure = {}

      const writePath = path.join(app.get('clientViewsBundledOutput'), bundleName)
      let fileDataToWrite = '/* Do not edit; generated automatically by Roosevelt */\n\n'

      for (const file of bundleFiles) {
        const templatePath = path.join(viewsPath, file)
        let templateContent = fs.readFileSync(templatePath, 'utf8').trim()
        let templateName = path.relative(viewsPath, templatePath).replace(/\\/g, '/') // windows fix

        // chop the extension off the template name if the file extension matches the configured view engine
        if (templateName.endsWith(viewEngine)) templateName = file.slice(0, -(viewEngine.length + 1))

        // if the onClientViewsProcess event is defined, run the template through it
        if (onClientViewsProcess && typeof onClientViewsProcess === 'function') {
          templateContent = onClientViewsProcess(templateContent)
        }

        // minify the template if the option is turned on (and it is not a pug file since pug can't really be minified)
        if (willMinifyTemplates && path.extname(file) !== 'pug') {
          templateContent = await htmlMinifier(templateContent, minifyOptions)
        }

        bundleDataStructure[templateName] = templateContent
      }

      fileDataToWrite += `module.exports = ${JSON.stringify(bundleDataStructure, null, 2)}\n`
      let oldFileData
      try {
        oldFileData = fs.readFileSync(writePath, 'utf8')
      } catch (e) {
        oldFileData = ''
      }
      if (oldFileData !== fileDataToWrite) fsr.writeFileSync(writePath, fileDataToWrite, ['📝', `${appName} writing new JS file ${writePath}`.green])
    } catch (err) {
      logger.error(`Failed to create view bundle with the following configuration! ${bundles}`)
      logger.error(err)
    }
  }
}
