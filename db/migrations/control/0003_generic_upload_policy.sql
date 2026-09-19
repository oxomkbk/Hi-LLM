update control.upload_policies
set allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json',
      'application/zip', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4', 'video/quicktime', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4',
      'application/octet-stream'
    ],
    allowed_extensions = array[
      'png', 'jpg', 'jpeg', 'webp', 'gif',
      'pdf', 'txt', 'md', 'csv', 'json',
      'zip', '7z', 'gz', 'tar',
      'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'mp4', 'mov', 'webm', 'mp3', 'wav', 'm4a'
    ],
    max_size_bytes = 524288000,
    multipart_threshold_bytes = 16777216,
    part_size_bytes = 8388608,
    max_concurrency = 3,
    session_ttl_seconds = 86400,
    max_active_sessions = 3,
    daily_quota_bytes = 2147483648,
    total_quota_bytes = 10737418240
where scope = 'generic-file';
