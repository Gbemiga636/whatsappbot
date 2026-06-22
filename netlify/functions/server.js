/**
 * Netlify serverless entry — wraps Express for AWS Lambda-style invocations.
 */
const serverless = require('serverless-http');
const app = require('../../src/app');

exports.handler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'application/octet-stream'],
});
