const express = require("express");
const router = express.Router();
const { uploadDoc } = require("../config/uploadDocument");
const { uploadDocument } = require("../controllers/uploads/uploadDocController");

// Upload 1 file duy nhất với key là "document"
router.post("/document", uploadDoc.single("document"), uploadDocument);

module.exports = router;