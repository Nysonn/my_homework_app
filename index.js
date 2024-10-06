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

// GET ROUTE FOR LOGIN
app.get('/login', (req, res) => {
  res.render('login'); 
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

