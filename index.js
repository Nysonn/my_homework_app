import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import multer from "multer";
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define storage settings for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Specify the destination directory for uploaded files
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // Save the file with its original name
  }
});

// File filter to accept only PDF files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true); // Accept the file
  } else {
    cb(new Error('Only PDF files are allowed!'), false); // Reject the file
  }
};

// Initialize multer with the specified storage and file filter
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));


//MIDDLEWARE TO CHECK THE ROLE OF THE USER


// Middleware to check if the user is a teacher
function isTeacher(req, res, next) {
  console.log("User role in session:", req.session.role);
  if (req.session.role === 'teacher') {
    return next();
  } else {
    return res.status(403).send('Access denied. Only teachers can upload homework.');
  }
}

// Middleware to check if the user is a parent
function isParent(req, res, next) {
  console.log("User role in session:", req.session.role);
  if (req.session.role === 'parent') {
    return next();
  } else {
    return res.status(403).send('Access denied.');
  }
}


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
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).send('Invalid username or password.');
    }

    // Store user role and ID in session
    req.session.userId = user.id;
    req.session.role = user.role.toLowerCase();  // Case-insensitive role checking

     // Log the session details for debugging
     console.log('User logged in:', {
      id: req.session.userId,
      role: req.session.role
    });

    // Redirect based on role
    if (req.session.role === 'teacher') {
      return res.redirect('/teachers');
    } else if (req.session.role === 'parent') {
      return res.redirect('/parents');
    } else {
      return res.status(400).send('User role not recognized.');
    }

  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).send('Server error');
  }
});


// GET ROUTE FOR TEACHER'S DASHBOARD
app.get('/teachers', isTeacher, async (req, res) => {
  try {
    // Retrieve homework uploads from the database specific to the teacher if needed
    const query = `SELECT * FROM primary_one_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('teachers', {
      uploadedHomework: result.rows,
      success: req.query.success,
      userRole: req.session.role
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// GET ROUTE FOR THE PARENT DASHBOARD
app.get('/parents', isParent, async (req, res) => {
  try {
    // Parents might want to see all homework uploads
    const query = `SELECT * FROM primary_one_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('parents', {
      uploadedHomework: result.rows,
      success: req.query.success,
      userRole: req.session.role
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// GET ROUTE FOR THE DOWNLOAD HOMEWORK
app.get('/download_homework', async (req, res) => {
  res.render('download_homework'); 
});

// POST ROUTE FOR DOWNLOADING THE HOMEWORK
app.post('/download-homework', (req, res) => {
  const filePath = req.body.filePath;

  // Log the file path received
  console.log('File path received for download:', filePath);

  // Get the absolute path of the file
  const absolutePath = path.join(__dirname, filePath);

  // Check if the file exists
  fs.access(absolutePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('File not found:', err);
      return res.status(404).send('File not found');
    }

    // Set the content type to application/pdf
    res.setHeader('Content-Type', 'application/pdf');

    // If file exists, send it for download
    res.download(absolutePath, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        return res.status(500).send('Error downloading file');
      }
    });
  });
});


// PRIMARY ONE TEACHERS UPLOAD ROUTES FOR ALL FOUR SUBJECTS


//GET ROUTE FOR PRIMARY ONE SELECT SUBJECTS (TEACHERS)
app.get('/primary-one-subjects-select', async (req, res) => {
  res.render('primary-one'); 
});

//GET ROUTE FOR PRIMARY ONE SELECT SUBJECTS (PARENTS)
app.get('/primary-one-subjects-select-parents', async (req, res) => {
  res.render('download-primary-one'); 
});

//GET ROUTE FOR PRIMARY ONE MATH UPLOAD HOMEWORK (TEACHERS)
app.get('/upload-math-primary-one', isTeacher, async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-math-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY ONE MATH DOWNLOAD HOMEWORK (PARENTS)
app.get('/download-math-primary-one', isParent, async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-math-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY ONE MATH UPLOAD HOMEWORK
app.post('/upload-mathematics-homework', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_one_mathematics_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-math-primary-one?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY ONE ENGLISH UPLOAD HOMEWORK
app.get('/upload-eng-primary-one', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_english_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-eng-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY ONE ENGLISH DOWNLOAD HOMEWORK (PARENTS)
app.get('/download-eng-primary-one', isParent, async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_english_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-eng-homework', {
      uploadedHomework: result.rows, 
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY ONE ENGLISH UPLOAD HOMEWORK
app.post('/upload-english-homework', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_one_english_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-eng-primary-one?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY ONE SCIENCE UPLOAD HOMEWORK
app.get('/upload-sci-primary-one', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_science_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-sci-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY ONE SCIENCE DOWNLOAD HOMEWORK (PARENTS)
app.get('/download-sci-primary-one', isParent, async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_science_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-sci-homework', {
      uploadedHomework: result.rows, 
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY ONE SCIENCE UPLOAD HOMEWORK
app.post('/upload-science-homework', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_one_science_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sci-primary-one?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY ONE SST UPLOAD HOMEWORK
app.get('/upload-sst-primary-one', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_social_studies_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-sst-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY ONE SST DOWNLOAD HOMEWORK (PARENTS)
app.get('/download-sst-primary-one', isParent, async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_one_social_studies_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-one-sst-homework', {
      uploadedHomework: result.rows, 
      success: req.query.success,
      userRole: req.session.role 
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY ONE SST UPLOAD HOMEWORK
app.post('/upload-sst-homework', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_one_social_studies_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sst-primary-one?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});


// PRIMARY TWO TEACHERS UPLOAD ROUTES FOR ALL FOUR SUBJECTS

//GET ROUTE FOR PRIMARY TWO SELECT SUBJECTS
app.get('/primary-two-subjects-select', async (req, res) => {
  res.render('primary-two'); 
});

//GET ROUTE FOR PRIMARY TWO ENGLISH UPLOAD HOMEWORK
app.get('/upload-eng-primary-two', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_two_english_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-two-eng-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY TWO ENGLISH UPLOAD HOMEWORK
app.post('/upload-eng-homework-primary-two', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_two_english_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-eng-primary-two?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY TWO MATHEMATICS UPLOAD HOMEWORK
app.get('/upload-math-primary-two', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_two_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-two-math-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY TWO MATHEMATICS UPLOAD HOMEWORK
app.post('/upload-math-homework-primary-two', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_two_mathematics_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-math-primary-two?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});


//GET ROUTE FOR PRIMARY TWO SCIENCE UPLOAD HOMEWORK
app.get('/upload-sci-primary-two', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_two_science_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-two-sci-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY TWO SCIENCE UPLOAD HOMEWORK
app.post('/upload-sci-homework-primary-two', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_two_science_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sci-primary-two?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY TWO SOCIAL STUDIES UPLOAD HOMEWORK
app.get('/upload-sst-primary-two', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_two_social_studies_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-two-sst-homework', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY TWO SOCIAL STUDIES UPLOAD HOMEWORK
app.post('/upload-sst-homework-primary-two', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_two_social_studies_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sst-primary-two?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

// PRIMARY THREE TEACHERS UPLOAD ROUTES FOR ALL FOUR SUBJECTS

//GET ROUTE FOR PRIMARY THREE SELECT SUBJECTS
app.get('/primary-three-subjects-select', async (req, res) => {
  res.render('primary-three'); 
});

//GET ROUTE FOR PRIMARY THREE MATHEMATICS UPLOAD HOMEWORK
app.get('/upload-math-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-math', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE MATHEMATICS UPLOAD HOMEWORK
app.post('/upload-math-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_mathematics_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-math-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY THREE ENGLISH UPLOAD HOMEWORK
app.get('/upload-eng-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_english_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-eng', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE ENGLISH UPLOAD HOMEWORK
app.post('/upload-eng-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_english_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-eng-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY THREE SCIENCE UPLOAD HOMEWORK
app.get('/upload-sci-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_science_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-sci', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE SCIENCE UPLOAD HOMEWORK
app.post('/upload-sci-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_science_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sci-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY THREE SOCIAL STUDIES UPLOAD HOMEWORK
app.get('/upload-sst-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_social_studies_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-sst', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE SOCIAL STUDIES UPLOAD HOMEWORK
app.post('/upload-sst-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_social_studies_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sst-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

// PRIMARY THREE TEACHERS UPLOAD ROUTES FOR ALL FOUR SUBJECTS

//GET ROUTE FOR PRIMARY THREE SELECT SUBJECTS
app.get('/primary-three-subjects-select', async (req, res) => {
  res.render('primary-three'); 
});

//GET ROUTE FOR PRIMARY THREE MATHEMATICS UPLOAD HOMEWORK
app.get('/upload-math-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-math', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE MATHEMATICS UPLOAD HOMEWORK
app.post('/upload-math-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_mathematics_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-math-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY THREE ENGLISH UPLOAD HOMEWORK
app.get('/upload-eng-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_english_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-eng', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE ENGLISH UPLOAD HOMEWORK
app.post('/upload-eng-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_english_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-eng-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY THREE SCIENCE UPLOAD HOMEWORK
app.get('/upload-sci-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_science_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-sci', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE SCIENCE UPLOAD HOMEWORK
app.post('/upload-sci-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_science_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sci-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY THREE SOCIAL STUDIES UPLOAD HOMEWORK
app.get('/upload-sst-primary-three', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_three_social_studies_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-three-sst', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY THREE SOCIAL STUDIES UPLOAD HOMEWORK
app.post('/upload-sst-homework-primary-three', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_three_social_studies_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sst-primary-three?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

// PRIMARY FOUR TEACHERS UPLOAD ROUTES FOR ALL FOUR SUBJECTS

//GET ROUTE FOR PRIMARY FOUR SELECT SUBJECTS
app.get('/primary-four-subjects-select', async (req, res) => {
  res.render('primary-four'); 
});

//GET ROUTE FOR PRIMARY FOUR MATHEMATICS UPLOAD HOMEWORK
app.get('/upload-math-primary-four', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_four_mathematics_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-four-math', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY FOUR MATHEMATICS UPLOAD HOMEWORK
app.post('/upload-math-homework-primary-four', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_four_mathematics_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-math-primary-four?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY FOUR ENGLISH UPLOAD HOMEWORK
app.get('/upload-eng-primary-four', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_four_english_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-four-eng', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY FOUR ENGLISH UPLOAD HOMEWORK
app.post('/upload-eng-homework-primary-four', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_four_english_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-eng-primary-four?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY FOUR SCIENCE UPLOAD HOMEWORK
app.get('/upload-sci-primary-four', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_four_science_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-four-sci', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY FOUR SCIENCE UPLOAD HOMEWORK
app.post('/upload-sci-homework-primary-four', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_four_science_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sci-primary-four?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

//GET ROUTE FOR PRIMARY FOUR SOCIAL STUDIES UPLOAD HOMEWORK
app.get('/upload-sst-primary-four', async (req, res) => {
  try {
    // Retrieve homework uploads from the database
    const query = `SELECT * FROM primary_four_social_studies_homework_uploads ORDER BY upload_date DESC;`;
    const result = await db.query(query);

    res.render('upload-primary-four-sst', {
      uploadedHomework: result.rows, // Pass the uploaded homework data to the template
      success: req.query.success // Pass success message if it exists
    });
  } catch (err) {
    console.error('Error fetching uploaded homework:', err);
    res.status(500).send('Server error');
  }
});

// POST ROUTE FOR PRIMARY FOUR SOCIAL STUDIES UPLOAD HOMEWORK
app.post('/upload-sst-homework-primary-four', upload.single('homeworkFile'), async (req, res) => {
  const uploadDate = req.body.uploadDate;
  const filePath = req.file.path; // The path where the file is saved
  const originalFileName = req.file.originalname; // The original name of the uploaded file

  try {
    // Save the file information to the database
    const query = `
      INSERT INTO primary_four_social_studies_homework_uploads (upload_date, file_path, original_file_name)
      VALUES ($1, $2, $3);
    `;
    const values = [uploadDate, filePath, originalFileName];

    await db.query(query, values);

    // Redirect back to the upload page with a success message
    res.redirect('/upload-sst-primary-four?success=true');
  } catch (err) {
    console.error('Error uploading homework:', err);
    res.status(500).send('Server error');
  }
});

// START THE SERVER
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

