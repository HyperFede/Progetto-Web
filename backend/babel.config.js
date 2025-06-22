module.exports = {
  presets: [
    // @babel/preset-env is a smart preset that allows you to use the latest JavaScript features.
    // It automatically determines the Babel plugins and polyfills you need based on your target environments.
    ['@babel/preset-env', { targets: { node: 'current' } }],
  ],
};