const uploadVideo = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Không có file video",
    });
  }

  const videoUrl = `/uploads/videos/${req.file.filename}`;

  res.status(200).json({
    success: true,
    message: "Upload video thành công",
    data: {
      filename: req.file.filename,
      url: videoUrl,
    },
  });
};

module.exports = {
  uploadVideo,
};
