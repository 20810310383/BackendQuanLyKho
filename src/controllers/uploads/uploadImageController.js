const uploadImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Không có file ảnh",
    });
  }

  const imageUrl = `/uploads/images/${req.file.filename}`;
  console.log("req.file", req.file);


  res.status(200).json({
    success: true,
    message: "Upload ảnh thành công",
    data: {
      filename: req.file.filename,
      url: imageUrl,
    },
  });
};

module.exports = {
  uploadImage,
};
