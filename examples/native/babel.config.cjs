// Metro compiles the workspace's TypeScript sources here, where a published
// app gets compiled JavaScript. babel-preset-expo runs Flow's type stripper
// on every file, which rejects TypeScript's `declare` class fields, so
// TypeScript's own is run first.
module.exports = (api) => {
  api.cache(true)
  const preset = require.resolve("babel-preset-expo", {
    paths: [require.resolve("expo/package.json")]
  })
  return {
    presets: [preset],
    overrides: [{
      test: (file) => file !== undefined && file.endsWith(".ts"),
      plugins: [[
        require.resolve("@babel/plugin-transform-typescript", {
          paths: [preset]
        }),
        { allowDeclareFields: true, allowNamespaces: true }
      ]]
    }]
  }
}
