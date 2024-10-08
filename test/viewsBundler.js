/* eslint-env mocha */

const assert = require('assert')
const generateTestApp = require('./util/generateTestApp')
const cleanupTestApp = require('./util/cleanupTestApp')
const fsr = require('../lib/tools/fsr')()
const { fork } = require('child_process')
const fse = require('fs-extra')
const path = require('path')
const klawsync = require('klaw-sync')
const htmlMinifier = require('html-minifier-terser').minify

const minifyOptions = {
  removeComments: true,
  collapseWhitespace: true,
  collapseBooleanAttributes: true,
  remoaveAttributeQuotes: true,
  removeEmptyAttributes: true
}

describe('Views Bundler Tests', function () {
  const appDir = path.join(__dirname, 'app/viewsBundler')

  const template1 = `
    <!-- roosevelt-allowlist output.js -->
    <h1>Hello World</h1>
    <div>
        <p>lorem ipsum dolor set</p>
    </div>
  `
  const template2 = `
    <div>This will be put in bundle.js</div>
  `

  const blocklistedTemplate = `
    <!-- roosevelt-blocklist -->
    <p>This is in a blocklist</p>
  `

  const pathOfTemplates = [
    path.join(appDir, 'mvc/views/a.html'),
    path.join(appDir, 'mvc/views/b.html'),
    path.join(appDir, 'mvc/views/bad.html'),
    path.join(appDir, 'mvc/views/nested/a.html'),
    path.join(appDir, 'mvc/views/nested/b.html'),
    path.join(appDir, 'mvc/views/nested/bad.html')
  ]

  const pathOfExposedTemplates = [
    path.join(appDir, 'public/templates/output.js')
  ]

  const staticTemplates = [
    template1,
    template2,
    blocklistedTemplate,
    template1,
    template2,
    blocklistedTemplate
  ]

  const options = { rooseveltPath: '../../../roosevelt', method: 'startServer', stopServer: true }

  beforeEach(function () {
    fse.ensureDirSync(path.join(appDir, 'mvc/views/nested'))

    for (let i = 0; i < pathOfTemplates.length; i++) {
      fse.writeFileSync(pathOfTemplates[i], staticTemplates[i])
    }
  })

  afterEach(function (done) {
    cleanupTestApp(appDir, (err) => {
      if (err) {
        throw err
      } else {
        done()
      }
    })
  })

  it('should properly expose template files in an allowlist', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['a.html']
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesExist(appDir, 'public/templates', pathOfExposedTemplates)

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should add .html to a template that doesn\'t have an extension', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['a']
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesExist(appDir, 'public/templates', pathOfExposedTemplates)
        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should not create a templates folder if there are no items in the allowlist', function (done) {
    generateTestApp({
      appDir,
      clientViews: {},
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesNotCreated(appDir, 'public/templates')

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should not create a templates folder if makeBuildArtifacts is false', function (done) {
    generateTestApp({
      appDir,
      clientViews: {},
      csrfProtection: false,
      makeBuildArtifacts: false
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesNotCreated(appDir, 'public/templates')

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should not create a templates folder if there is bundles without any contents', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': []
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesNotCreated(appDir, 'public/templates')

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should not create a templates folder if there is a bundle that is null', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': null
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesNotCreated(appDir, 'public/templates')

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should send an error to the console with an nonexistent template', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['fake.html']
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stderr.on('data', (result) => {
      if (result.includes('no such file or directory')) {
        assert.strictEqual(result.includes('fake.html'), true)
      }

      testApp.send('stop')
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should skip a file if it is in the allowlist but has a <!-- roosevelt-blocklist --> tag', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['bad.html']
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesNotCreated(appDir, 'public/templates')

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should save a file to a specific location when the output folder option is modified', function (done) {
    const customPathArray = [
      path.join(appDir, 'public/js/output.js')
    ]

    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['a.html']
        },
        output: 'js'
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        assertFilesExist(appDir, 'public/js', customPathArray)
        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should minify a template when the minify param is enabled', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['a.html']
        },
        minify: true
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplatesArray = klawsync(pathToExposedTemplatesFolder)

        exposedTemplatesArray.forEach(async (file) => {
          if (fsr.fileExists(file.path)) {
            delete require.cache[require.resolve(file.path)]
          }
          const templateJSON = require(file.path)

          for (const key in templateJSON) {
            const template = templateJSON[key]
            assert.strictEqual(await htmlMinifier(template, minifyOptions), template)
          }
        })

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should not minify templates when it the param is disabled', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['a.html']
        },
        minify: false
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplatesArray = klawsync(pathToExposedTemplatesFolder)

        exposedTemplatesArray.forEach(async (file) => {
          if (fsr.fileExists(file.path)) {
            delete require.cache[require.resolve(file.path)]
          }
          const templateJSON = require(file.path)

          for (const key in templateJSON) {
            const template = templateJSON[key]
            assert.notStrictEqual(await htmlMinifier(template, minifyOptions), template)
          }
        })

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should accept minify options', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['a.html']
        },
        minify: true,
        minifyOptions
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplatesArray = klawsync(pathToExposedTemplatesFolder)

        exposedTemplatesArray.forEach(async (file) => {
          if (fsr.fileExists(file.path)) {
            delete require.cache[require.resolve(file.path)]
          }
          const templateJSON = require(file.path)

          for (const key in templateJSON) {
            const template = templateJSON[key]
            assert.strictEqual(await htmlMinifier(template, minifyOptions), template)
          }
        })

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should be able to preprocess templates', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['a.html']
        },
        minifyOptions
      },
      csrfProtection: false,
      makeBuildArtifacts: true,
      onClientViewsProcess: '(template) => { return template + "<div>Appended div!</div>" }'
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplatesArray = klawsync(pathToExposedTemplatesFolder)

        exposedTemplatesArray.forEach((file) => {
          if (fsr.fileExists(file.path)) {
            delete require.cache[require.resolve(file.path)]
          }
          const templateJSON = require(file.path)

          for (const key in templateJSON) {
            const template = templateJSON[key]
            assert.strictEqual(template.endsWith('<div>Appended div!</div>'), true)
          }
        })

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should be able to skip exposing files in the exposeAll step when already in allowlist', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        exposeAll: true,
        allowlist: {
          'output.js': ['a.html']
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        assert.strictEqual(exposedTemplates.length, 2)

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should save a file that has an allowlist defined both in roosevelt args and the template to the location defined in the template', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        exposeAll: true,
        allowlist: {
          'foobar.js': ['a.html']
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        exposedTemplates.forEach(bundle => {
          const bundleName = bundle.path.split(path.sep).pop()

          assert.notStrictEqual(bundleName, 'foobar.js')
        })

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should be able to include a blocklist', function (done) {
    const blocklist = ['bad.html']

    generateTestApp({
      appDir,
      clientViews: {
        exposeAll: true,
        blocklist
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        exposedTemplates.forEach((file) => {
          if (fsr.fileExists(file.path)) {
            delete require.cache[require.resolve(file.path)]
          }
          const templateJSON = require(file.path)
          const templates = Object.keys(templateJSON)

          blocklist.forEach(notExposedFile => {
            templates.forEach(template => {
              assert.strictEqual(template.includes(notExposedFile), false)
            })
          })
        })

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should be able to blocklist files with a <!-- roosevelt-blocklist --> tag at the top of the file', function (done) {
    const blocklist = ['bad.html']

    generateTestApp({
      appDir,
      clientViews: {
        exposeAll: true
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        exposedTemplates.forEach((file) => {
          if (fsr.fileExists(file.path)) {
            delete require.cache[require.resolve(file.path)]
          }
          const templateJSON = require(file.path)
          const templates = Object.keys(templateJSON)

          blocklist.forEach(notExposedFile => {
            templates.forEach(template => {
              assert.strictEqual(template.includes(notExposedFile), false)
            })
          })
        })

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should save allowlisted files with a <!-- roosevelt-allowlist --> tag to the proper location', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        exposeAll: true
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        const outputBundle = exposedTemplates.filter(exposedTemp => exposedTemp.path.endsWith('output.js'))[0]

        if (fsr.fileExists(outputBundle.path)) {
          delete require.cache[require.resolve(outputBundle.path)]
        }
        const templateJSON = require(outputBundle.path)
        const templates = Object.keys(templateJSON)
        assert.strictEqual(templates.length, 2)

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should save allowlisted files without a <!-- roosevelt-allowlist --> tag to the default location', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        exposeAll: true
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        const outputBundle = exposedTemplates.filter(exposedTemp => exposedTemp.path.endsWith('bundle.js'))[0]

        if (fsr.fileExists(outputBundle.path)) {
          delete require.cache[require.resolve(outputBundle.path)]
        }
        const templateJSON = require(outputBundle.path)
        const templates = Object.keys(templateJSON)

        assert.strictEqual(templates.length, 2)

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should include nested files when using exposeAll', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        exposeAll: true
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        const outputBundle = exposedTemplates.filter(exposedTemp => exposedTemp.path.endsWith('bundle.js'))[0]

        if (fsr.fileExists(outputBundle.path)) {
          delete require.cache[require.resolve(outputBundle.path)]
        }
        const templateJSON = require(outputBundle.path)
        const templates = Object.keys(templateJSON)

        assert.strictEqual(templates.length, 2)

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })

  it('should include all files within a directory in allowlist', function (done) {
    generateTestApp({
      appDir,
      clientViews: {
        allowlist: {
          'output.js': ['nested']
        }
      },
      csrfProtection: false,
      makeBuildArtifacts: true
    }, options)

    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    testApp.stdout.on('data', (result) => {
      if (serverStarted(result)) {
        const pathToExposedTemplatesFolder = path.join(appDir, 'public/templates')

        const exposedTemplates = klawsync(pathToExposedTemplatesFolder, { nodir: true })

        const outputBundle = exposedTemplates.filter(exposedTemp => exposedTemp.path.endsWith('output.js'))[0]

        if (fsr.fileExists(outputBundle.path)) {
          delete require.cache[require.resolve(outputBundle.path)]
        }
        const templateJSON = require(outputBundle.path)
        const templates = Object.keys(templateJSON)

        assert.strictEqual(templates.length, 2)

        testApp.send('stop')
      }
    })

    testApp.on('exit', () => {
      done()
    })
  })
})

function serverStarted (result) {
  return result.toString().includes('Roosevelt Express HTTP server listening')
}

function assertFilesNotCreated (appDir, templatePath) {
  const pathToExposedTemplatesFolder = path.join(appDir, templatePath)

  try {
    klawsync(pathToExposedTemplatesFolder)
  } catch (err) {
    assert.strictEqual(err.message.includes('no such file or directory'), true)
  }
}

function assertFilesExist (appDir, templatePath, pathOfExposedTemplates) {
  const pathToExposedTemplatesFolder = path.join(appDir, templatePath)

  const exposedTemplatesArray = klawsync(pathToExposedTemplatesFolder)

  exposedTemplatesArray.forEach((file) => {
    const test = pathOfExposedTemplates.includes(file.path)
    assert.strictEqual(test, true)
  })
}
