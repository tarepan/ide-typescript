// Node.js standard libraries
const fs = require('fs')
const path = require('path')

// LSP support library [atom-languageclient](https://github.com/atom/atom-languageclient)
const {AutoLanguageClient} = require('atom-languageclient')

const jsScopes = [ 'source.js', 'source.js.jsx', 'javascript' ]
const tsScopes = [ 'source.ts', 'source.tsx', 'typescript' ]
const allScopes = tsScopes.concat(jsScopes)
const tsExtensions = [ '*.json', '.ts', '.tsx' ]
const jsExtensions = [ '.js', '.jsx' ]
const allExtensions = tsExtensions.concat(jsExtensions)

// atom-languageclient standard way
// * startServerProcess
// * getGrammarScopes
// * getLanguageName
// * getServerName

class TypeScriptLanguageClient extends AutoLanguageClient {
  // should override
  getGrammarScopes () {
    return atom.config.get('ide-typescript.javascriptSupport') ? allScopes : tsScopes
  }
  // should override
  getLanguageName () { return 'TypeScript' }
  // should override
  getServerName () { return 'SourceGraph' }

  // (in atom-languageClient, auto-languageclient.ts)
  // > Must override startServerProcess to start language server process when extending AutoLanguageClient
  startServerProcess () {
    this.supportedExtensions = atom.config.get('ide-typescript.javascriptSupport') ? allExtensions : tsExtensions
    // sourcegraph's **javascript-typescript-langserver** language server [github](https://github.com/sourcegraph/javascript-typescript-langserver)
    // specified as dependent library in package.json
    const args = [ 'node_modules/javascript-typescript-langserver/lib/language-server-stdio' ]
    return super.spawnChildNode(args, { cwd: path.join(__dirname, '..') })
  }

  // customization??
  preInitialization (connection) {
    connection.onCustom('$/partialResult', () => {}) // Suppress partialResult until the language server honors 'streaming' detection
  }

  // customization??
  consumeLinterV2() {
    if (atom.config.get('ide-typescript.diagnosticsEnabled') === true) {
      super.consumeLinterV2.apply(this, arguments)
    }
  }

  // customization??
  deactivate() {
    return Promise.race([super.deactivate(), this.createTimeoutPromise(2000)])
  }

  // Override?? no internal use
  shouldStartForEditor(editor) {
    if (atom.config.get('ide-typescript.ignoreFlow') === true) {
      const flowConfigPath = path.join(this.getProjectPath(editor.getURI() || ''), '.flowconfig');
      if (fs.existsSync(flowConfigPath)) return false;
    }
    return super.shouldStartForEditor(editor);
  }

  // Not important
  // internal utility method
  getProjectPath(filePath) {
    return atom.project.getDirectories().find(d => filePath.startsWith(d.path)).path
  }

  // Not important
  // Promise wrapper of setTimeout.
  createTimeoutPromise(milliseconds) {
    return new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        clearTimeout(timeout)
        this.logger.error(`Server failed to shutdown in ${milliseconds}ms, forcing termination`)
        resolve()
      }, milliseconds)
    })
  }

  // override??
  // no internal use
  provideAutocomplete() {
    const autocompleteResultsFirst = atom.config.get('ide-typescript.autocompleteResultsFirst')
    return {
      ...super.provideAutocomplete(),
      suggestionPriority: autocompleteResultsFirst ? 2 : 1
    }
  }

  // no internal use
  onDidConvertAutocomplete(completionItem, suggestion, request) {
    if (suggestion.rightLabel == null || suggestion.displayText == null) return

    const nameIndex = suggestion.rightLabel.indexOf(suggestion.displayText)
    if (nameIndex >= 0) {
      const signature = suggestion.rightLabel.substr(nameIndex + suggestion.displayText.length).trim()
      let paramsStart = -1
      let paramsEnd = -1
      let returnStart = -1
      let bracesDepth = 0
      for(let i = 0; i < signature.length; i++) {
        switch(signature[i]) {
          case '(': {
            if (bracesDepth++ === 0 && paramsStart === -1) {
              paramsStart = i;
            }
            break;
          }
          case ')': {
            if (--bracesDepth === 0 && paramsEnd === -1) {
              paramsEnd = i;
            }
            break;
          }
          case ':': {
            if (returnStart === -1 && bracesDepth === 0) {
              returnStart = i;
            }
            break;
          }
        }
      }
      if (atom.config.get('ide-typescript.returnTypeInAutocomplete') === 'left') {
        if (paramsStart > -1) {
          suggestion.rightLabel = signature.substring(paramsStart, paramsEnd + 1).trim()
        }
        if (returnStart > -1) {
          suggestion.leftLabel = signature.substring(returnStart + 1).trim()
        }
        // We have a 'property' icon, we don't need to pollute the signature with '(property) '
        const propertyPrefix = '(property) '
        if (suggestion.rightLabel.startsWith(propertyPrefix)) {
          suggestion.rightLabel = suggestion.rightLabel.substring(propertyPrefix.length)
        }
      } else {
        suggestion.rightLabel = signature.substring(paramsStart).trim()
        suggestion.leftLabel = ''
      }
    }
  }

  // No internal use
  filterChangeWatchedFiles(filePath) {
    return this.supportedExtensions.indexOf(path.extname(filePath).toLowerCase()) > -1;
  }
}

module.exports = new TypeScriptLanguageClient()
