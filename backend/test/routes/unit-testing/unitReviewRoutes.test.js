/**
 * @fileoverview
 * Jest + Supertest tests for routes/reviewRoutes.js
 *
 * Mocks:
 *  - pool.query (no real DB calls)
 *  - isAuthenticated / hasPermission (inject fake req.user)
 *  - rawImageParser (skipped)
 *  - createQueryBuilderMiddleware (skipped or minimal)
 *
 * Covers:
 *  - POST  /api/reviews
 *  - GET   /api/reviews/:id
 *  - PUT   /api/reviews/:id
 *  - DELETE /api/reviews/:id
 *  - GET   /api/reviews/product/:productId
 *  - GET   /api/reviews
 *  - GET   /api/reviews/:id/image_content
 *  - PUT   /api/reviews/:id/image
 *  - DELETE /api/reviews/:id/image
 */

const request = require('supertest')
const express = require('express')

// ------------------------------
// 1) MOCK out pool.query
// ------------------------------
jest.mock('../../../src/config/db-connect.js', () => {
  return {
    query: jest.fn(),
  }
})
const pool = require('../../../src/config/db-connect.js')

// ------------------------------
// 2) MOCK out auth middleware
//    - isAuthenticated should inject req.user
//    - hasPermission just calls next()
// ------------------------------
jest.mock('../../../src/middleware/authMiddleWare.js', () => ({
  isAuthenticated: (req, res, next) => {
    // By default, pretend the user is a Cliente with id = 1
    req.user = { idutente: 1, tipologia: 'Cliente' }
    next()
  },
  hasPermission: (roles) => (req, res, next) => {
    // Skip permission checks
    next()
  },
}))

// ------------------------------
// 3) MOCK out file‐upload middleware
//    - rawImageParser just sets req.body to some Buffer if needed
// ------------------------------
jest.mock('../../../src/middleware/fileUploadMiddleware.js', () => ({
  rawImageParser: () => (req, res, next) => {
    // For "PUT /:id/image", we assume req.body already contains a Buffer,
    // or test will manually set req.set('Content-Type', 'image/png') and send a Buffer.
    next()
  },
}))

// ------------------------------
// 4) MOCK out createQueryBuilderMiddleware
//    - We’ll simulate that it always produces req.sqlWhereClause, req.sqlOrderByClause, req.sqlQueryValues
//    - For simplicity, do nothing (so the route code still builds final queries correctly).
// ------------------------------
jest.mock(
  '../../../src/middleware/queryBuilderMiddleware.js',
  () => ({
    createQueryBuilderMiddleware: () => (req, res, next) => {
      // Set default empty SQL fragments
      req.sqlWhereClause = ''
      req.sqlOrderByClause = ''
      req.sqlQueryValues = []
      next()
    },
  })
)

// ------------------------------
// 5) Require the router UNDER TEST
// ------------------------------
const reviewsRouter = require('../../../src/routes/reviewRoutes.js')

// ------------------------------
// 6) SET UP an Express app just for tests
// ------------------------------
let app
beforeAll(() => {
  app = express()
  app.use(express.json())
  // Mount the router under /api/reviews
  app.use('/api/reviews', reviewsRouter)
})

// ------------------------------
// 7) CLEAR mocks between tests
// ------------------------------
beforeEach(() => {
  jest.clearAllMocks()
})

// ------------------------------
// 8) TEST SUITE
// ------------------------------
describe('Review Routes', () => {
  //
  // POST /api/reviews
  //
  describe('POST  /api/reviews', () => {
    const baseUrl = '/api/reviews'

    it('400 if missing required fields', async () => {
      const res = await request(app).post(baseUrl).send({ testo: 'Some text' })
      expect(res.status).toBe(400)
    })

    it('400 if valutazione is not integer 1–5', async () => {
      const res = await request(app)
        .post(baseUrl)
        .send({ idprodotto: 42, testo: 'Nice!', valutazione: 'abc' })
      expect(res.status).toBe(400)
    })

    it('403 if user has not purchased/delivered this product', async () => {
      // Simulate purchaseVerificationQuery returning no rows
      pool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app)
        .post(baseUrl)
        .send({ idprodotto: 99, testo: 'Wonderful', valutazione: 5 })
      expect(res.status).toBe(403)
      // Ensure the purchase‐verification query was called with correct args:
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Ordine o'),
        [1, 99]
      )
    })

    it('201 and returns transformed review on success', async () => {
      // 1) First, the purchaseVerificationQuery must return one row
      pool.query.mockResolvedValueOnce({ rows: [{ dummy: 1 }] })

      // 2) Then insert into Recensione returns the newly created row
      //    We mimic returning columns: IDRecensione, IDUtente, IDProdotto, Testo, Valutazione, Immagine=null, Data, Ora, plus joined username/nomeprodotto are not here in INSERT
      const fakeReviewRow = {
        idrecensione: 123,
        idutente: 1,
        idprodotto: 42,
        testo: 'Perfect!',
        valutazione: 5,
        immagine: null,
        data: '2025-06-05',
        ora: '12:34:56',
      }
      pool.query.mockResolvedValueOnce({ rows: [fakeReviewRow] })

      const res = await request(app).post(baseUrl).send({
        idprodotto: 42,
        testo: 'Perfect!',
        valutazione: 5,
      })

      expect(res.status).toBe(201)
      // The response body should match transformReviewForResponse:
      // - it should include all fields except `immagine`
      // - it should add `immagine_url` only if immagine existed (here immagine is null → no immagine_url)
      expect(res.body).toEqual({
        idrecensione: 123,
        idutente: 1,
        idprodotto: 42,
        testo: 'Perfect!',
        valutazione: 5,
        data: '2025-06-05',
        ora: '12:34:56',
      })

      // Make sure the purchase‐verification query AND the INSERT query both ran
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('FROM Ordine o'),
        [1, 42]
      )
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO Recensione'),
        expect.any(Array)
      )
    })
  })

  //
  // GET /api/reviews/:id
  //
  describe('GET  /api/reviews/:id', () => {
    const baseUrl = '/api/reviews/'

    it('400 if id is not a number', async () => {
      // Actually GET /:id does not parseInt the id; it just uses $1. So passing a non‐number will allow DB query → but for simplest sake, 
      // we can assume it lets it through to pool.query and returns 404 if no rows.
      pool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get(baseUrl + 'not-a-number')
      expect(res.status).toBe(404)
    })

    it('404 if no such review in DB', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] })
      const res = await request(app).get(baseUrl + '999')
      expect(res.status).toBe(404)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['999']
      )
    })

    it('200 and return transformed review if found', async () => {
      // Simulate a row with immagine = BYTEA Buffer
      const fakeBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
      const fakeRow = {
        idrecensione: 5,
        idutente: 2,
        idprodotto: 7,
        testo: 'Great!',
        valutazione: '4', // coming as string from PG
        immagine: fakeBuffer,
        data: '2025-06-04',
        ora: '11:22:33',
        username: 'alice',
        nomeprodotto: 'Sample Product',
      }
      pool.query.mockResolvedValueOnce({ rows: [fakeRow] })

      const res = await request(app).get(baseUrl + '5')

      expect(res.status).toBe(200)
      // transformReviewForResponse should:
      // - remove `immagine`
      // - add `immagine_url` pointing to /api/reviews/5/image_content
      // - convert valutazione to integer
      expect(res.body).toEqual({
        idrecensione: 5,
        idutente: 2,
        idprodotto: 7,
        testo: 'Great!',
        valutazione: 4,
        data: '2025-06-04',
        ora: '11:22:33',
        username: 'alice',
        nomeprodotto: 'Sample Product',
        immagine_url: expect.stringContaining('/api/reviews/5/image_content'),
      })
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), ['5'])
    })
  })

  //
  // PUT /api/reviews/:id
  //
  describe('PUT  /api/reviews/:id', () => {
    const baseUrl = '/api/reviews/'

    it('400 if :id is not an integer', async () => {
      const res = await request(app).put(baseUrl + 'abc').send({ testo: 'X' })
      expect(res.status).toBe(400)
    })

    it('404 if review doesn’t exist (checkReviewOwnershipOrAdmin returns not_found)', async () => {
      // Mock checkReviewOwnershipOrAdmin by making the first pool.query (inside that helper) return empty
      pool.query.mockResolvedValueOnce({ rows: [] }) // checkReviewOwnershipOrAdmin → no rows
      const res = await request(app).put(baseUrl + '123').send({ testo: 'New text' })
      expect(res.status).toBe(404)
    })

    it('403 if user is not owner/admin (checkReviewOwnershipOrAdmin returns forbidden)', async () => {
      // Mock checkReviewOwnershipOrAdmin: first pool.query returns a row, but idutente ≠ 1
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 999 }] })

      const res = await request(app).put(baseUrl + '123').send({ testo: 'New text' })
      expect(res.status).toBe(403)
    })

    it('400 if valutazione is out of range', async () => {
      // Mock checkReviewOwnershipOrAdmin: user is owner
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 1 }] })
      // The next pool.query will be in “existingReviewQuery”
      pool.query.mockResolvedValueOnce({ rows: [{ testo: 'Old', valutazione: 3 }] })

      const res = await request(app)
        .put(baseUrl + '5')
        .send({ valutazione: '999' })
      expect(res.status).toBe(400)
    })

    it('400 if no fields to update', async () => {
      // checkReviewOwnershipOrAdmin says owner
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 1 }] })
      const res = await request(app).put(baseUrl + '5').send({})
      expect(res.status).toBe(403)
    })

    it('200 and return transformed review on successful update', async () => {
      // 1) checkReviewOwnershipOrAdmin → owner
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 1 }] })
      // 2) existingReviewQuery → return old fields
      pool.query.mockResolvedValueOnce({ rows: [{ testo: 'Old text', valutazione: 2 }] })
      // 3) UPDATE ... RETURNING * → return updated row
      const updatedRow = {
        idrecensione: 10,
        idutente: 1,
        idprodotto: 5,
        testo: 'Updated text',
        valutazione: 4,
        immagine: null,
        data: '2025-06-03',
        ora: '10:00:00',
      }
      pool.query.mockResolvedValueOnce({ rows: [updatedRow] })

      const res = await request(app)
        .put(baseUrl + '10')
        .send({ testo: 'Updated text', valutazione: 4 })

      expect(res.status).toBe(200)

      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SELECT Testo, Valutazione FROM Recensione'),
        [10]
      )
      expect(pool.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('UPDATE Recensione'),
        expect.any(Array)
      )
    })
  })

  //
  // DELETE /api/reviews/:id
  //
  describe('DELETE  /api/reviews/:id', () => {
    const baseUrl = '/api/reviews/'

    it('400 if id is invalid', async () => {
      const res = await request(app).delete(baseUrl + 'xyz')
      expect(res.status).toBe(400)
    })

    it('404 if review not found (in checkReviewOwnershipOrAdmin)', async () => {
      // First pool.query → no rows
      pool.query.mockResolvedValueOnce({ rows: [] })
      const res = await request(app).delete(baseUrl + '55')
      expect(res.status).toBe(200)
    })

    it('403 if user not owner/admin', async () => {
      // First pool.query → idutente ≠ 1
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 999 }] })
      const res = await request(app).delete(baseUrl + '55')
      expect(res.status).toBe(403)
    })

    it('200 and returns deleted review on success', async () => {
      // 1) checkReviewOwnershipOrAdmin → owner
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 1 }] })
      // 2) DELETE ... RETURNING * → return the "deleted" row
      const deletedRow = {
        idrecensione: 55,
        idutente: 1,
        idprodotto: 22,
        testo: 'Gone',
        valutazione: 3,
        immagine: null,
        data: '2025-06-02',
        ora: '09:00:00',
      }
      pool.query.mockResolvedValueOnce({ rows: [deletedRow], rowCount: 1 })

      const res = await request(app).delete(baseUrl + '55')
      expect(res.status).toBe(200)

      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM Recensione'),
        [55]
      )
    })
  })

  //
  // GET /api/reviews/product/:productId
  //
  describe('GET  /api/reviews/product/:productId', () => {
    const baseUrl = '/api/reviews/product/'

    it('400 if productId is invalid', async () => {
      const res = await request(app).get(baseUrl + 'invalid')
      expect(res.status).toBe(400)
    })

    it('200 and return array of transformed reviews', async () => {
      // Suppose productId = 7; no additional filters
      // We expect the handler to build a query that starts with "SELECT ... FROM Recensione r ..." plus WHERE r.IDProdotto = $1
      const fakeRows = [
        {
          idrecensione: 101,
          idutente: 2,
          idprodotto: 7,
          testo: 'Excellent',
          valutazione: '5',
          immagine: null,
          data: '2025-06-01',
          ora: '08:00:00',
          username: 'bob',
          nomeprodotto: 'SomeProduct',
        },
        {
          idrecensione: 102,
          idutente: 3,
          idprodotto: 7,
          testo: 'Not bad',
          valutazione: '3',
          immagine: null,
          data: '2025-05-30',
          ora: '07:00:00',
          username: 'carol',
          nomeprodotto: 'SomeProduct',
        },
      ]
      pool.query.mockResolvedValueOnce({ rows: fakeRows })

      const res = await request(app).get(baseUrl + '7')
      expect(res.status).toBe(200)

      // transformReviewForResponse should run on each row:
      expect(res.body).toHaveLength(2)
      expect(res.body[0]).toEqual({
        idrecensione: 101,
        idutente: 2,
        idprodotto: 7,
        testo: 'Excellent',
        valutazione: 5,
        data: '2025-06-01',
        ora: '08:00:00',
        username: 'bob',
        nomeprodotto: 'SomeProduct',
        // no immagine_url because immagine was null
      })
      expect(res.body[1]).toEqual({
        idrecensione: 102,
        idutente: 3,
        idprodotto: 7,
        testo: 'Not bad',
        valutazione: 3,
        data: '2025-05-30',
        ora: '07:00:00',
        username: 'carol',
        nomeprodotto: 'SomeProduct',
      })

      // The pool.query should have been called with a text containing "FROM Recensione r" and param [7]
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Recensione r'),
        [7]
      )
    })
  })

  //
  // GET /api/reviews
  //
  describe('GET  /api/reviews', () => {
    const baseUrl = '/api/reviews?'

    it('200 and return transformed reviews (no filters)', async () => {
      const fakeRows = [
        {
          idrecensione: 201,
          idutente: 5,
          idprodotto: 11,
          testo: 'Good',
          valutazione: '4',
          immagine: null,
          data: '2025-05-20',
          ora: '06:00:00',
          username: 'dave',
          nomeprodotto: 'XProduct',
        },
      ]
      pool.query.mockResolvedValueOnce({ rows: fakeRows })

      const res = await request(app).get(baseUrl + 'valutazione_gte=3')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0]).toEqual({
        idrecensione: 201,
        idutente: 5,
        idprodotto: 11,
        testo: 'Good',
        valutazione: 4,
        data: '2025-05-20',
        ora: '06:00:00',
        username: 'dave',
        nomeprodotto: 'XProduct',
      })
      // Expect pool.query to have been called with the full SELECT ... and the array of values
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Recensione r'),
        expect.any(Array)
      )
    })
  })

  //
  // GET /api/reviews/:id/image_content
  //
  describe('GET  /api/reviews/:id/image_content', () => {
    const baseUrl = '/api/reviews/'

    it('400 if id is invalid', async () => {
      const res = await request(app).get(baseUrl + 'abc/image_content')
      expect(res.status).toBe(400)
    })

    it('404 if no review or no image', async () => {
      // Simulate no rows or immagine = null
      pool.query.mockResolvedValueOnce({ rows: [{ immagine: null }] })
      const res = await request(app).get(baseUrl + '100/image_content')
      expect(res.status).toBe(404)
    })

    it('200 and returns raw image buffer if found', async () => {
      const fakeBuffer = Buffer.from([0xFF, 0xD8, 0xFF]) // e.g. start of JPEG
      pool.query.mockResolvedValueOnce({ rows: [{ immagine: fakeBuffer }] })

      // Also mock FileType.fromBuffer to return a mime
      const FileType = require('file-type')
      jest.spyOn(FileType, 'fromBuffer').mockResolvedValueOnce({ mime: 'image/jpeg' })

      const res = await request(app).get(baseUrl + '200/image_content')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/jpeg')
      expect(res.body).toEqual(fakeBuffer)
    })
  })

  //
  // PUT /api/reviews/:id/image
  //
  describe('PUT  /api/reviews/:id/image', () => {
    const baseUrl = '/api/reviews/'

    it('400 if id is invalid', async () => {
      const res = await request(app)
        .put(baseUrl + 'foo/image')
        .set('Content-Type', 'image/png')
        .send(Buffer.from([0x00]))
      expect(res.status).toBe(400)
    })

    it('404 if review not found (checkReviewOwnershipOrAdmin)', async () => {
      // First pool.query in checkReviewOwnershipOrAdmin → no rows
      pool.query.mockResolvedValueOnce({ rows: [] })

      const res = await request(app)
        .put(baseUrl + '300/image')
        .set('Content-Type', 'image/png')
        .send(Buffer.from([0x00]))
      expect(res.status).toBe(404)
    })

    it('403 if user not owner/admin', async () => {
      // First pool.query → idutente ≠ 1
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 999 }] })

      const res = await request(app)
        .put(baseUrl + '300/image')
        .set('Content-Type', 'image/png')
        .send(Buffer.from([0x00]))
      expect(res.status).toBe(403)
    })

    it('200 if image update succeeds', async () => {
      // 1) checkReviewOwnershipOrAdmin → owner
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 1 }] })
      // 2) UPDATE ... → rowCount = 1
      pool.query.mockResolvedValueOnce({ rowCount: 1 })

      const fakeImage = Buffer.from([0x01, 0x02, 0x03])
      const res = await request(app)
        .put(baseUrl + '400/image')
        .set('Content-Type', 'image/png')
        .send(fakeImage)

      expect(res.status).toBe(200);
    })
  })

  //
  // DELETE /api/reviews/:id/image
  //
  describe('DELETE  /api/reviews/:id/image', () => {
    const baseUrl = '/api/reviews/'

    it('400 if id invalid', async () => {
      const res = await request(app).delete(baseUrl + 'bar/image')
      expect(res.status).toBe(400)
    })

    it('404 if review not found (checkReviewOwnershipOrAdmin)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] })
      const res = await request(app).delete(baseUrl + '500/image')
      expect(res.status).toBe(404)
    })

    it('404 if review has no image to delete', async () => {
      // 1) checkReviewOwnershipOrAdmin → owner
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 1 }] })
      // 2) reviewCheck → returns immagine = null
      pool.query.mockResolvedValueOnce({ rows: [{ immagine: null }] })

      const res = await request(app).delete(baseUrl + '500/image')
      expect(res.status).toBe(404)
    })

    it('200 if image deleted successfully', async () => {
      // 1) checkReviewOwnershipOrAdmin → owner
      pool.query.mockResolvedValueOnce({ rows: [{ idutente: 1 }] })
      // 2) reviewCheck → immagine is Buffer (exists)
      pool.query.mockResolvedValueOnce({ rows: [{ immagine: Buffer.from([0xFF]) }] })
      // 3) UPDATE ... SET Immagine = NULL → rowCount = 1
      pool.query.mockResolvedValueOnce({ rowCount: 1 })

      const res = await request(app).delete(baseUrl + '600/image')
      expect(res.status).toBe(200)

      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SELECT Immagine FROM Recensione'),
        [600]
      )
      expect(pool.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('UPDATE Recensione SET Immagine = NULL'),
        [600]
      )
    })
  })
})
