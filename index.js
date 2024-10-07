import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import multer from "multer";
import session from 'express-session';
import path from 'path';

dotenv.config();

const port = 3000;
const app = express();

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// Connect to the PostgreSQL database
db.connect();

// Set EJS as the view engine
app.set("view engine", "ejs");
app.use(express.static("public"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const upload = multer({ dest: 'uploads/' });


// GET ROUTE FOR SIGN-UP
app.get('/sign-up', (req, res) => {
  res.render('sign-up'); 
});

// POST ROUTE FOR SIGN-UP
app.post('/signup', async (req, res) => {
  const { username, role, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (username, role, password) 
      VALUES ($1, $2, $3) RETURNING id;
    `;
    const values = [username, role, hashedPassword];

    const result = await db.query(query, values);

    res.redirect('/login');
  } catch (err) {
    console.error('Error inserting user into the database:', err);
    res.status(500).send('Server error');
  }
});

// GET ROUTE FOR LOGIN
app.get('/login', (req, res) => {
  res.render('login'); 
});

// POST ROUTE FOR LOGIN WITH ROLE CHECK
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const query = `SELECT * FROM users WHERE username = $1`;
    const result = await db.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(400).send('Invalid username or password.');
    }

    const user = result.rows[0];
    
    // Log the user role for debugging
    console.log("User role:", user.role);

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).send('Invalid username or password.');
    }

    // Ensure case-insensitive role checking
    const userRole = user.role.toLowerCase();

    // Role-based redirection
    if (userRole === 'teacher') {
      return res.redirect('/teachers');
    } else if (userRole === 'parent') {
      return res.redirect('/parents');
    } else {
      // Fallback for other roles
      return res.status(400).send('User role is not recognized.');
    }

  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).send('Server error');
  }
});

// GET ROUTE FOR TEACHER'S DASHBOARD
app.get('/teachers', async (req, res) => {
  res.render('teachers'); 
});

// GET ROUTE FOR THE PARENT DASHBOARD
app.get('/parents', async (req, res) => {
  res.render('parents'); 
});

// GET ROUTE FOR THE DOWNLOAD HOMEWORK
app.get('/download_homework', async (req, res) => {
  res.render('download_homework'); 
});

// GET ROUTE FOR THE UPLOAD HOMEWORK
app.get('/upload_homework', async (req, res) => {
  res.render('upload_homework'); 
});

// START THE SERVER
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

