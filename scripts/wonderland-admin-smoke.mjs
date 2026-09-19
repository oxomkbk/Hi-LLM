import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.BUSINESS_DATABASE_URL })
await client.connect()
try {
  await client.query('begin')
  const actor = await client.query('select id from public.app_users order by created_at limit 1')
  const category = await client.query('select id from public.wonder_categories where scope = \'question\' order by depth desc limit 1')
  const newsCategory = await client.query('select id from public.wonder_categories where scope = \'news\' order by depth desc limit 1')
  if (!actor.rows[0] || !category.rows[0] || !newsCategory.rows[0])
    throw new Error('missing smoke-test fixture')
  const document = {
    content: [{ content: [{ text: '这是事务回滚式管理员问题写入测试正文，用于验证创建、读取、更新和软删除的完整链路能够正常运行。', type: 'text' }], type: 'paragraph' }],
    schema: 'wonderland-document',
    version: 1,
  }
  const created = await client.query(`
    insert into public.wonder_questions (
      slug, author_id, category_id, title, summary, content_json, content_text
    ) values (
      'wonderland-admin-smoke', $1::uuid, $2::uuid,
      '管理员问题写入冒烟测试', '这是事务回滚式管理员问题写入测试摘要内容。',
      $3::jsonb, '这是事务回滚式管理员问题写入测试正文，用于验证创建、读取、更新和软删除的完整链路能够正常运行。'
    ) returning id
  `, [actor.rows[0].id, category.rows[0].id, JSON.stringify(document)])
  await client.query(`
    update public.wonder_questions
    set title = '管理员问题更新冒烟测试', edited_at = now()
    where id = $1::uuid
  `, [created.rows[0].id])
  const removed = await client.query(`
    update public.wonder_questions
    set visibility = 'deleted', deleted_at = now()
    where id = $1::uuid
    returning visibility
  `, [created.rows[0].id])
  if (removed.rows[0]?.visibility !== 'deleted')
    throw new Error('soft-delete smoke test failed')

  const newsDocument = {
    content: [
      { content: [{ marks: [{ type: 'bold' }], text: '这是新闻写入冒烟测试标题段落', type: 'text' }], level: 2, type: 'heading' },
      { content: [{ text: '这是事务回滚式新闻写入测试正文，用于验证文章的创建、读取、更新、发布与删除链路。', type: 'text' }], type: 'paragraph' },
    ],
    schema: 'wonderland-document',
    version: 1,
  }
  const newsText = '这是新闻写入冒烟测试标题段落\n这是事务回滚式新闻写入测试正文，用于验证文章的创建、读取、更新、发布与删除链路。'
  const createdNews = await client.query(`
    insert into public.wonder_news_articles (
      slug, category_id, author_id, title, summary, content_json, content_text
    ) values (
      'wonderland-news-admin-smoke', $1::uuid, $2::uuid,
      '管理员新闻冒烟测试', '这是事务回滚式管理员新闻冒烟测试摘要内容。',
      $3::jsonb, $4
    ) returning id
  `, [newsCategory.rows[0].id, actor.rows[0].id, JSON.stringify(newsDocument), newsText])
  const readNews = await client.query(`
    select content_json from public.wonder_news_articles where id = $1::uuid
  `, [createdNews.rows[0].id])
  if (readNews.rows[0]?.content_json?.content?.[0]?.type !== 'heading')
    throw new Error('rich news document read smoke test failed')
  const publishedNews = await client.query(`
    update public.wonder_news_articles
    set status = 'published', published_at = now(), title = '管理员新闻更新冒烟测试'
    where id = $1::uuid
    returning status
  `, [createdNews.rows[0].id])
  if (publishedNews.rows[0]?.status !== 'published')
    throw new Error('news publish smoke test failed')
  const createdComment = await client.query(`
    insert into public.wonder_comments (news_id, author_id, body)
    values ($1::uuid, $2::uuid, '这是新闻评论事务冒烟测试。')
    returning id, news_id, question_id
  `, [createdNews.rows[0].id, actor.rows[0].id])
  if (createdComment.rows[0]?.news_id !== createdNews.rows[0].id || createdComment.rows[0]?.question_id !== null)
    throw new Error('news comment target constraint smoke test failed')
  const commentImage = await client.query(`
    insert into public.file_objects (
      id, owner_id, storage_profile_id, object_key, original_name,
      size_bytes, mime_type, extension, visibility, status, ready_at
    ) values (
      gen_random_uuid(), $1::uuid, gen_random_uuid(),
      'smoke/wonderland-comment-image.webp', 'wonderland-comment-image.webp',
      1024, 'image/webp', 'webp', 'private', 'ready', now()
    ) returning id
  `, [actor.rows[0].id])
  await client.query(`
    insert into public.wonder_comment_files (comment_id, file_id, position)
    values ($1::uuid, $2::uuid, 0)
  `, [createdComment.rows[0].id, commentImage.rows[0].id])
  const imageLink = await client.query(`
    select file_id from public.wonder_comment_files where comment_id = $1::uuid
  `, [createdComment.rows[0].id])
  if (imageLink.rows[0]?.file_id !== commentImage.rows[0].id)
    throw new Error('news comment image link smoke test failed')
  const deletedNews = await client.query(`
    delete from public.wonder_news_articles where id = $1::uuid returning id
  `, [createdNews.rows[0].id])
  if (!deletedNews.rows[0])
    throw new Error('news delete smoke test failed')
  const deletedComment = await client.query(`
    select id from public.wonder_comments where id = $1::uuid
  `, [createdComment.rows[0].id])
  if (deletedComment.rowCount)
    throw new Error('news comment cascade smoke test failed')
  const deletedImageLink = await client.query(`
    select file_id from public.wonder_comment_files where comment_id = $1::uuid
  `, [createdComment.rows[0].id])
  if (deletedImageLink.rowCount)
    throw new Error('news comment image cascade smoke test failed')
  await client.query('rollback')
  console.log('管理员问题、新闻与评论 CRUD 数据库事务冒烟测试通过（已回滚）')
}
catch (error) {
  await client.query('rollback').catch(() => undefined)
  throw error
}
finally {
  await client.end()
}
