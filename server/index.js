const express = require('express');
const cors = require('cors');
const monk = require('monk'); //database, not the mongoose one
const Filter = require('bad-words'); //filter the bad words
const rateLimit = require('express-rate-limit');

const app = express();

const db = monk(process.env.MONGO_URI || 'localhost/meower'); //connect to database
const mews = db.get('mews');
const filter = new Filter(); //create the object to use methods from the package

app.enable('trust proxy');

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Meower! 😹 🐈'
  });
});

app.get('/mews', (req, res, next) => {
  mews
    .find()
    .then(mews => {
      res.json(mews);
    }).catch(next);
});

app.get('/v2/mews', (req, res, next) => {
  // let skip = Number(req.query.skip) || 0;
  // let limit = Number(req.query.limit) || 10;
  let { skip = 0, limit = 5, sort = 'desc' } = req.query;
  skip = parseInt(skip) || 0;
  limit = parseInt(limit) || 5;

  skip = skip < 0 ? 0 : skip;
  limit = Math.min(50, Math.max(1, limit));

  Promise.all([
    mews
      .count(),
    mews
      .find({}, {
        skip,
        limit,
        sort: {
          created: sort === 'desc' ? -1 : 1
        }
      })
  ])
    .then(([ total, mews ]) => {
      res.json({
        mews,
        meta: {
          total,
          skip,
          limit,
          has_more: total - (skip + limit) > 0,
        }
      });
    }).catch(next);
});

function isValidMew(mew) { //validate the input
  return mew.name && mew.name.toString().trim() !== '' && mew.name.toString().trim().length <= 50 &&
    mew.content && mew.content.toString().trim() !== '' && mew.content.toString().trim().length <= 140;
}

app.use(rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 1
}));

const createMew = (req, res, next) => {
  if (isValidMew(req.body)) {
    const mew = {
      name: filter.clean(req.body.name.toString().trim()), //filter is the method from package bad-words
      content: filter.clean(req.body.content.toString().trim()), //filter is the method from package bad-words
      created: new Date() //show the date 
    };

    //innerText returns the visible part of the element
    //contentText returns the full element
    mews
      .insert(mew)
      .then(createdMew => {
        res.json(createdMew);
      }).catch(next);
  } else {
    res.status(422);
    res.json({
      message: 'Hey! Name and Content are required! Name cannot be longer than 50 characters. Content cannot be longer than 140 characters.'
    });
  }
};

app.post('/mews', createMew);
app.post('/v2/mews', createMew);

app.use((error, req, res, next) => {
  res.status(500);
  res.json({
    message: error.message
  });
});

app.listen(5000, () => {
  console.log('Listening on http://localhost:5000');
});
