/**
 * Intelligent Canvas Search Endpoint (Vercel)
 * POST /api/intelligent-search
 *
 * Analyzes user queries, understands course structure, and executes optimized vector searches.
 * This is the Vercel equivalent of netlify/functions/intelligent-search.js
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Cache for course structure (5-minute TTL)
const courseStructureCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get course structure for a study set
 */
async function getCourseStructure(studySetId, userId) {
  const cacheKey = `${studySetId}_structure`
  const cached = courseStructureCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Intelligent Search] Using cached course structure')
    return cached.data
  }

  try {
    console.log('[Intelligent Search] Fetching course structure for study set:', studySetId)

    const { data: studySet, error: studySetError } = await supabase
      .from('study_sets')
      .select('linked_canvas_courses')
      .eq('id', studySetId)
      .eq('user_id', userId)
      .single()

    if (studySetError || !studySet?.linked_canvas_courses?.length) {
      console.log('No linked Canvas courses found')
      return null
    }

    const courseIds = studySet.linked_canvas_courses

    const { data: courses, error: courseError } = await supabase
      .from('canvas_courses')
      .select(
        `
        id,
        course_name,
        course_context,
        canvas_modules (
          id,
          module_name,
          category,
          canvas_items (
            item_name,
            item_type,
            category,
            canvas_item_id,
            vectorized
          )
        )
      `
      )
      .in('id', courseIds)
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (courseError) {
      console.error('Course structure query error:', courseError)
      throw courseError
    }

    if (!courses || courses.length === 0) {
      console.log('No courses found or courses are deleted')
      return null
    }

    const course = courses[0]

    const modules = []
    const allItemNames = new Set()

    for (const module of course.canvas_modules || []) {
      const items = (module.canvas_items || [])
        .filter((item) => item.vectorized === true)
        .map((item) => ({
          item_name: item.item_name,
          item_type: item.item_type,
          category: item.category,
          canvas_item_id: item.canvas_item_id
        }))

      if (items.length > 0) {
        modules.push({
          module_name: module.module_name,
          category: module.category,
          items
        })

        items.forEach((item) => allItemNames.add(item.item_name))
      }
    }

    const courseStructure = {
      course_id: course.id,
      course_name: course.course_name,
      course_context: course.course_context,
      modules,
      all_item_names: Array.from(allItemNames)
    }

    courseStructureCache.set(cacheKey, {
      data: courseStructure,
      timestamp: Date.now()
    })

    console.log('[Intelligent Search] Course structure loaded:', {
      course_name: course.course_name,
      modules: modules.length,
      items: allItemNames.size
    })

    return courseStructure
  } catch (error) {
    console.error('Failed to fetch course structure:', error)
    return null
  }
}

/**
 * Analyze user query with LLM
 */
async function analyzeSearchQuery(userQuery, courseStructure) {
  try {
    console.log('[Intelligent Search] Analyzing query:', userQuery)

    if (!courseStructure) {
      console.log('[Intelligent Search] No course structure, using semantic-only strategy')
      return {
        strategy: 'semantic_only',
        reasoning: 'No course structure available',
        filters: {},
        semantic_query: userQuery,
        search_scope: 'all'
      }
    }

    const courseStructureSummary = buildCourseStructureSummary(courseStructure)

    const systemPrompt = `You are a search query analyzer for Canvas courses. Your job is to analyze user queries and determine the best search strategy to retrieve relevant course materials.

You have access to the course structure with modules and items. When analyzing a query, you should:
1. Identify if the user is asking about a specific item (e.g., "Tutorial 10")
2. Identify if they want a specific type of content (e.g., "all lectures")
3. Identify the topic or concept they care about
4. Decide the best search strategy to retrieve relevant content

Return ONLY valid JSON, no other text.`

    const userPrompt = `Course Structure:
${courseStructureSummary}

User Query: "${userQuery}"

Analyze this query and return a JSON object with:
{
  "strategy": "filter_by_name" | "filter_by_type" | "semantic_only" | "multi_item" | "overview",
  "reasoning": "Brief explanation of why you chose this strategy",
  "filters": {
    "item_names": ["exact or partial item names if applicable"],
    "item_types": ["Assignment", "File"] (if filtering by type),
    "categories": ["exercises_assignments", "lecture_slides"] (if filtering by category),
    "exclude_items": []
  },
  "semantic_query": "Optimized query for vector search focusing on the main topic/concept",
  "search_scope": "specific" | "broad" | "all"
}

GUIDELINES:
- If query mentions specific item names (e.g., "Tutorial 10", "Lecture 1"), use "filter_by_name"
- If query specifies a type (e.g., "from lectures", "in assignments"), use "filter_by_type" or set categories
- If query is about a topic across all materials, use "semantic_only"
- If query mentions multiple items, use "multi_item"
- If query is very broad (e.g., "what's covered"), use "overview"
- The semantic_query should focus on the KEY CONCEPT, not the item name
- For multi_item queries, include all mentioned item names in filters

Examples:
Query: "Create flashcards from Tutorial 10"
→ strategy: "filter_by_name", filters: {item_names: ["Tutorial 10"]}, semantic_query: "key concepts definitions tutorial"

Query: "Summarize all lecture content about elasticity"
→ strategy: "filter_by_type", filters: {categories: ["lecture_slides"]}, semantic_query: "elasticity economic principles"

Query: "What topics are covered in tutorials 10 and 11?"
→ strategy: "multi_item", filters: {item_names: ["Tutorial 10", "Tutorial 11"]}, semantic_query: "main topics covered"

Return ONLY JSON.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    })

    let analysis
    try {
      const content = response.choices[0]?.message?.content || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      analysis = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError)
      console.log('Raw response:', response.choices[0]?.message?.content)
      return {
        strategy: 'semantic_only',
        reasoning: 'LLM analysis failed, using semantic search',
        filters: {},
        semantic_query: userQuery,
        search_scope: 'all'
      }
    }

    console.log('[Intelligent Search] Strategy chosen:', {
      strategy: analysis.strategy,
      scope: analysis.search_scope,
      filters: analysis.filters
    })

    return analysis
  } catch (error) {
    console.error('Query analysis error:', error)
    return {
      strategy: 'semantic_only',
      reasoning: 'Error during analysis, using semantic search',
      filters: {},
      semantic_query: userQuery,
      search_scope: 'all'
    }
  }
}

/**
 * Build course structure summary for LLM prompt
 */
function buildCourseStructureSummary(courseStructure) {
  let summary = `Course: ${courseStructure.course_name}\n\n`
  summary += `All Available Items:\n`
  summary += courseStructure.all_item_names.slice(0, 50).map((name) => `- ${name}`).join('\n')
  if (courseStructure.all_item_names.length > 50) {
    summary += `\n... and ${courseStructure.all_item_names.length - 50} more items\n`
  }
  summary += `\n\nModule Breakdown:\n`
  for (const module of courseStructure.modules.slice(0, 10)) {
    summary += `\n${module.module_name} [${module.category}]:\n`
    for (const item of module.items.slice(0, 5)) {
      summary += `  - ${item.item_name} (${item.item_type})\n`
    }
    if (module.items.length > 5) {
      summary += `  ... and ${module.items.length - 5} more items\n`
    }
  }
  if (courseStructure.modules.length > 10) {
    summary += `\n... and ${courseStructure.modules.length - 10} more modules\n`
  }
  return summary
}

/**
 * Main handler (Vercel)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, study_set_id, user_id, context = {} } = req.body

    if (!query || !study_set_id || !user_id) {
      return res.status(400).json({
        error: 'Missing required fields: query, study_set_id, user_id'
      })
    }

    console.log('[Intelligent Search] Request:', { query, study_set_id })

    const courseStructure = await getCourseStructure(study_set_id, user_id)

    if (!courseStructure) {
      console.log('[Intelligent Search] No course structure, returning empty results')
      return res.status(200).json({
        results: [],
        message: 'No linked Canvas courses found',
        search_strategy: {
          strategy_used: 'none',
          filters_applied: {}
        }
      })
    }

    const searchStrategy = await analyzeSearchQuery(query, courseStructure)

    console.log('[Intelligent Search] Generating embedding for:', searchStrategy.semantic_query)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: searchStrategy.semantic_query
    })

    if (!embeddingResponse.data || !embeddingResponse.data[0]) {
      throw new Error('Failed to generate embedding from OpenAI')
    }

    const queryEmbedding = embeddingResponse.data[0].embedding

    console.log('[Intelligent Search] Executing vector search with filters:', searchStrategy.filters)

    const itemNamesPatterns = searchStrategy.filters?.item_names
      ? searchStrategy.filters.item_names.map((name) => `%${name}%`)
      : null

    const { data: results, error: searchError } = await supabase.rpc(
      'search_canvas_vectors_advanced',
      {
        query_embedding: queryEmbedding,
        course_ids: [courseStructure.course_id],
        user_id_param: user_id,
        item_names: itemNamesPatterns,
        item_types: searchStrategy.filters?.item_types || null,
        categories: searchStrategy.filters?.categories || null,
        match_threshold: 0.7,
        match_count: 10
      }
    )

    if (searchError) {
      console.error('[Intelligent Search] Vector search error:', searchError)
      throw searchError
    }

    console.log('[Intelligent Search] Found', results?.length || 0, 'matching results')

    return res.status(200).json({
      results: results || [],
      search_strategy: {
        strategy_used: searchStrategy.strategy,
        reasoning: searchStrategy.reasoning,
        filters_applied: searchStrategy.filters,
        search_scope: searchStrategy.search_scope,
        items_found: results?.length || 0
      },
      course_context: {
        course_id: courseStructure.course_id,
        course_name: courseStructure.course_name,
        course_context: courseStructure.course_context,
        modules_searched: courseStructure.modules.length,
        total_items: courseStructure.all_item_names.length
      }
    })
  } catch (error) {
    console.error('[Intelligent Search] Error:', error)
    return res.status(500).json({
      error: error?.message || 'Intelligent search failed'
    })
  }
}
