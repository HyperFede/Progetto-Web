module.exports = {
  // Specifies the test environment, 'node' is the default and appropriate for backend code.
  testEnvironment: 'node',

  transformIgnorePatterns: [
    '/node_modules/(?!express|send|mime|supertest|@babel/runtime)',
    ],
};