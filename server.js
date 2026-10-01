require("dotenv").config();

const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


const app = express();

const PORT =
  Number(process.env.PORT) || 3000;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "CHANGE_THIS_SECRET";


/* ========================================
   DATABASE
======================================== */

const db =
  new Database(
    path.join(__dirname, "rambhau.db")
  );


db.pragma("journal_mode = WAL");


db.exec(`

CREATE TABLE IF NOT EXISTS admins (

  id INTEGER PRIMARY KEY AUTOINCREMENT,

  username TEXT UNIQUE NOT NULL,

  password_hash TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

);


CREATE TABLE IF NOT EXISTS jobs (

  id INTEGER PRIMARY KEY AUTOINCREMENT,

  slug TEXT UNIQUE NOT NULL,

  title TEXT NOT NULL,

  company TEXT NOT NULL,

  district TEXT NOT NULL,

  city TEXT NOT NULL,

  category TEXT NOT NULL,

  job_type TEXT NOT NULL,

  salary TEXT NOT NULL,

  experience TEXT DEFAULT '',

  shift TEXT DEFAULT '',

  vacancies INTEGER DEFAULT 1,

  description TEXT NOT NULL,

  requirements TEXT DEFAULT '',

  posting_date TEXT,

  expiry_date TEXT NOT NULL,

  featured INTEGER DEFAULT 0,

  latest INTEGER DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

);


CREATE TABLE IF NOT EXISTS applications (

  id INTEGER PRIMARY KEY AUTOINCREMENT,

  job_id INTEGER NOT NULL,

  full_name TEXT NOT NULL,

  mobile TEXT NOT NULL,

  email TEXT DEFAULT '',

  current_city TEXT NOT NULL,

  age INTEGER NOT NULL,

  education TEXT DEFAULT '',

  experience TEXT DEFAULT '',

  resume_url TEXT DEFAULT '',

  message TEXT DEFAULT '',

  status TEXT NOT NULL DEFAULT 'new',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(job_id)
    REFERENCES jobs(id)
    ON DELETE CASCADE

);

`);


/* ========================================
   ADMIN CREATION
======================================== */

const adminUsername =
  process.env.ADMIN_USERNAME ||
  "admin";

const adminPassword =
  process.env.ADMIN_PASSWORD ||
  "ChangeThisStrongPassword123!";


const existingAdmin =
  db.prepare(
    "SELECT id FROM admins WHERE username = ?"
  ).get(adminUsername);


if (!existingAdmin) {

  const passwordHash =
    bcrypt.hashSync(
      adminPassword,
      12
    );


  db.prepare(`
    INSERT INTO admins
    (username, password_hash)
    VALUES (?, ?)
  `).run(
    adminUsername,
    passwordHash
  );

  console.log(
    "RAMBHAU admin account created."
  );

}


/* ========================================
   EXPRESS
======================================== */

app.use(
  express.json({
    limit: "1mb"
  })
);


app.use(
  express.urlencoded({
    extended: true
  })
);


app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* ========================================
   HELPERS
======================================== */

function slugify(text) {

  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

}


function createUniqueSlug(
  title,
  city
) {

  const base =
    slugify(
      `${title}-${city}`
    ) || "job";


  let slug = base;

  let number = 2;


  while (
    db.prepare(
      "SELECT id FROM jobs WHERE slug = ?"
    ).get(slug)
  ) {

    slug =
      `${base}-${number}`;

    number++;

  }


  return slug;

}


function clean(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value).trim();

}


function requireAuth(
  req,
  res,
  next
) {

  const header =
    req.headers.authorization || "";


  if (
    !header.startsWith("Bearer ")
  ) {

    return res
      .status(401)
      .json({
        error: "Authentication required."
      });

  }


  const token =
    header.slice(7);


  try {

    req.admin =
      jwt.verify(
        token,
        JWT_SECRET
      );

    next();

  } catch (error) {

    return res
      .status(401)
      .json({
        error: "Invalid or expired login."
      });

  }

}


/* ========================================
   HEALTH
======================================== */

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      status: "ok",
      service: "RAMBHAU"
    });

  }
);


/* ========================================
   ADMIN LOGIN
======================================== */

app.post(
  "/api/admin/login",
  (req, res) => {

    const username =
      clean(req.body.username);

    const password =
      String(
        req.body.password || ""
      );


    const admin =
      db.prepare(`
        SELECT *
        FROM admins
        WHERE username = ?
      `).get(username);


    if (!admin) {

      return res
        .status(401)
        .json({
          error:
            "Invalid username or password."
        });

    }


    const valid =
      bcrypt.compareSync(
        password,
        admin.password_hash
      );


    if (!valid) {

      return res
        .status(401)
        .json({
          error:
            "Invalid username or password."
        });

    }


    const token =
      jwt.sign(
        {
          id: admin.id,
          username: admin.username
        },
        JWT_SECRET,
        {
          expiresIn: "7d"
        }
      );


    res.json({
      token
    });

  }
);


/* ========================================
   PUBLIC JOBS
======================================== */

app.get(
  "/api/jobs",
  (req, res) => {

    const keyword =
      clean(req.query.keyword);

    const district =
      clean(req.query.district);

    const category =
      clean(req.query.category);


    let sql = `
      SELECT
        id,
        slug,
        title,
        company,
        district,
        city,
        category,
        job_type,
        salary,
        experience,
        shift,
        vacancies,
        posting_date,
        expiry_date,
        featured,
        latest
      FROM jobs
      WHERE date(expiry_date) >= date('now')
    `;


    const values = [];


    if (keyword) {

      sql += `
        AND (
          title LIKE ?
          OR company LIKE ?
          OR description LIKE ?
        )
      `;

      const search =
        `%${keyword}%`;

      values.push(
        search,
        search,
        search
      );

    }


    if (district) {

      sql +=
        " AND district = ? ";

      values.push(
        district
      );

    }


    if (category) {

      sql +=
        " AND category = ? ";

      values.push(
        category
      );

    }


    sql += `
      ORDER BY
        featured DESC,
        latest DESC,
        id DESC
    `;


    const limit =
      Math.min(
        Math.max(
          Number(req.query.limit) || 100,
          1
        ),
        100
      );


    sql +=
      ` LIMIT ${limit}`;


    const jobs =
      db
        .prepare(sql)
        .all(...values);


    res.json(jobs);

  }
);


/* ========================================
   SINGLE JOB
======================================== */

app.get(
  "/api/jobs/:slug",
  (req, res) => {

    const job =
      db.prepare(`
        SELECT
          id,
          slug,
          title,
          company,
          district,
          city,
          category,
          job_type,
          salary,
          experience,
          shift,
          vacancies,
          description,
          requirements,
          posting_date,
          expiry_date,
          featured,
          latest
        FROM jobs
        WHERE slug = ?
          AND date(expiry_date) >= date('now')
      `).get(
        req.params.slug
      );


    if (!job) {

      return res
        .status(404)
        .json({
          error: "Job not found."
        });

    }


    res.json(job);

  }
);


/* ========================================
   APPLICATION
======================================== */

app.post(
  "/api/applications",
  (req, res) => {

    const jobSlug =
      clean(req.body.job_slug);

    const fullName =
      clean(req.body.full_name);

    const mobile =
      clean(req.body.mobile);

    const email =
      clean(req.body.email);

    const currentCity =
      clean(req.body.current_city);

    const age =
      Number(req.body.age);

    const education =
      clean(req.body.education);

    const experience =
      clean(req.body.experience);

    const resumeUrl =
      clean(req.body.resume_url);

    const message =
      clean(req.body.message);


    if (
      !jobSlug ||
      !fullName ||
      !mobile ||
      !currentCity ||
      !age
    ) {

      return res
        .status(400)
        .json({
          error:
            "Please fill all required fields."
        });

    }


    if (
      age < 18 ||
      age > 70
    ) {

      return res
        .status(400)
        .json({
          error:
            "Please enter a valid age."
        });

    }


    const job =
      db.prepare(`
        SELECT id
        FROM jobs
        WHERE slug = ?
          AND date(expiry_date) >= date('now')
      `).get(jobSlug);


    if (!job) {

      return res
        .status(404)
        .json({
          error:
            "This job is no longer available."
        });

    }


    const result =
      db.prepare(`
        INSERT INTO applications
        (
          job_id,
          full_name,
          mobile,
          email,
          current_city,
          age,
          education,
          experience,
          resume_url,
          message
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(

        job.id,
        fullName,
        mobile,
        email,
        currentCity,
        age,
        education,
        experience,
        resumeUrl,
        message

      );


    res.status(201).json({

      success: true,

      application_id:
        result.lastInsertRowid

    });

  }
);


/* ========================================
   ADMIN - ALL JOBS
======================================== */

app.get(
  "/api/admin/jobs",
  requireAuth,
  (req, res) => {

    const jobs =
      db.prepare(`
        SELECT *
        FROM jobs
        ORDER BY id DESC
      `).all();


    res.json(jobs);

  }
);


/* ========================================
   ADMIN - ADD JOB
======================================== */

app.post(
  "/api/admin/jobs",
  requireAuth,
  (req, res) => {

    const title =
      clean(req.body.title);

    const company =
      clean(req.body.company);

    const district =
      clean(req.body.district);

    const city =
      clean(req.body.city);

    const category =
      clean(req.body.category);

    const jobType =
      clean(req.body.job_type);

    const salary =
      clean(req.body.salary);

    const experience =
      clean(req.body.experience);

    const shift =
      clean(req.body.shift);

    const vacancies =
      Number(req.body.vacancies) || 1;

    const description =
      clean(req.body.description);

    const requirements =
      clean(req.body.requirements);

    const postingDate =
      clean(req.body.posting_date) ||
      new Date()
        .toISOString()
        .slice(0, 10);

    const expiryDate =
      clean(req.body.expiry_date);

    const featured =
      req.body.featured ? 1 : 0;

    const latest =
      req.body.latest ? 1 : 0;


    if (
      !title ||
      !company ||
      !district ||
      !city ||
      !category ||
      !jobType ||
      !salary ||
      !description ||
      !expiryDate
    ) {

      return res
        .status(400)
        .json({
          error:
            "Please fill all required job fields."
        });

    }


    const slug =
      createUniqueSlug(
        title,
        city
      );


    const result =
      db.prepare(`
        INSERT INTO jobs
        (
          slug,
          title,
          company,
          district,
          city,
          category,
          job_type,
          salary,
          experience,
          shift,
          vacancies,
          description,
          requirements,
          posting_date,
          expiry_date,
          featured,
          latest
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(

        slug,
        title,
        company,
        district,
        city,
        category,
        jobType,
        salary,
        experience,
        shift,
        vacancies,
        description,
        requirements,
        postingDate,
        expiryDate,
        featured,
        latest

      );


    res.status(201).json({

      success: true,

      id:
        result.lastInsertRowid,

      slug

    });

  }
);


/* ========================================
   ADMIN - EDIT JOB
======================================== */

app.put(
  "/api/admin/jobs/:id",
  requireAuth,
  (req, res) => {

    const id =
      Number(req.params.id);


    const existing =
      db.prepare(
        "SELECT * FROM jobs WHERE id = ?"
      ).get(id);


    if (!existing) {

      return res
        .status(404)
        .json({
          error: "Job not found."
        });

    }


    const title =
      clean(req.body.title) ||
      existing.title;

    const company =
      clean(req.body.company) ||
      existing.company;

    const district =
      clean(req.body.district) ||
      existing.district;

    const city =
      clean(req.body.city) ||
      existing.city;

    const category =
      clean(req.body.category) ||
      existing.category;

    const jobType =
      clean(req.body.job_type) ||
      existing.job_type;

    const salary =
      clean(req.body.salary) ||
      existing.salary;

    const experience =
      clean(req.body.experience);

    const shift =
      clean(req.body.shift);

    const vacancies =
      Number(req.body.vacancies) ||
      existing.vacancies;

    const description =
      clean(req.body.description) ||
      existing.description;

    const requirements =
      clean(req.body.requirements);

    const postingDate =
      clean(req.body.posting_date) ||
      existing.posting_date;

    const expiryDate =
      clean(req.body.expiry_date) ||
      existing.expiry_date;

    const featured =
      req.body.featured !== undefined
        ? (req.body.featured ? 1 : 0)
        : existing.featured;

    const latest =
      req.body.latest !== undefined
        ? (req.body.latest ? 1 : 0)
        : existing.latest;


    db.prepare(`
      UPDATE jobs

      SET
        title = ?,
        company = ?,
        district = ?,
        city = ?,
        category = ?,
        job_type = ?,
        salary = ?,
        experience = ?,
        shift = ?,
        vacancies = ?,
        description = ?,
        requirements = ?,
        posting_date = ?,
        expiry_date = ?,
        featured = ?,
        latest = ?

      WHERE id = ?

    `).run(

      title,
      company,
      district,
      city,
      category,
      jobType,
      salary,
      experience,
      shift,
      vacancies,
      description,
      requirements,
      postingDate,
      expiryDate,
      featured,
      latest,
      id

    );


    res.json({
      success: true
    });

  }
);


/* ========================================
   ADMIN - DELETE JOB
======================================== */

app.delete(
  "/api/admin/jobs/:id",
  requireAuth,
  (req, res) => {

    const id =
      Number(req.params.id);


    const result =
      db.prepare(
        "DELETE FROM jobs WHERE id = ?"
      ).run(id);


    if (
      result.changes === 0
    ) {

      return res
        .status(404)
        .json({
          error:
            "Job not found."
        });

    }


    res.json({
      success: true
    });

  }
);


/* ========================================
   ADMIN - APPLICATIONS
======================================== */

app.get(
  "/api/admin/applications",
  requireAuth,
  (req, res) => {

    const applications =
      db.prepare(`
        SELECT
          applications.*,
          jobs.title AS job_title,
          jobs.company AS job_company

        FROM applications

        INNER JOIN jobs
          ON jobs.id = applications.job_id

        ORDER BY
          applications.id DESC

      `).all();


    res.json(applications);

  }
);


/* ========================================
   ADMIN - APPLICATION STATUS
======================================== */

app.patch(
  "/api/admin/applications/:id",
  requireAuth,
  (req, res) => {

    const id =
      Number(req.params.id);

    const status =
      clean(req.body.status);


    const allowed = [
      "new",
      "contacted",
      "shortlisted",
      "selected",
      "rejected",
      "joined"
    ];


    if (
      !allowed.includes(status)
    ) {

      return res
        .status(400)
        .json({
          error:
            "Invalid application status."
        });

    }


    const result =
      db.prepare(`
        UPDATE applications
        SET status = ?
        WHERE id = ?
      `).run(
        status,
        id
      );


    if (
      result.changes === 0
    ) {

      return res
        .status(404)
        .json({
          error:
            "Application not found."
        });

    }


    res.json({
      success: true
    });

  }
);


/* ========================================
   404 API
======================================== */

app.use(
  "/api",
  (req, res) => {

    res
      .status(404)
      .json({
        error: "API endpoint not found."
      });

  }
);


/* ========================================
   START SERVER
======================================== */

app.listen(
  PORT,
  () => {

    console.log(
      `RAMBHAU running on port ${PORT}`
    );

  }
);