import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HelloController } from '../src/hello.controller.js';

test('GET /hello returns exact response', async () => {
  const module = await Test.createTestingModule({ controllers: [HelloController] }).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    const response = await request(app.getHttpServer()).get('/hello');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { message: 'Hello World!' });
  } finally {
    await app.close();
  }
});
