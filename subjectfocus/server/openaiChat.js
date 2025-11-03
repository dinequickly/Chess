import { createClient } from '@supabase/supabase-js'

const MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-5-mini-2025-08-07'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseService = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null

const FLASHCARD_SYSTEM_PROMPT = `You are SubjectFocus, an assistant that helps students craft effective study materials.

When responding, you should provide:
1. A helpful message to the user
2. Any flashcards you want to create (optional)

Your response must be valid JSON matching this structure:
{
  "message": "Your helpful response to the user",
  "flashcards": [
    {
      "term": "Front of card",
      "definition": "Back of card"
    }
  ]
}

Guidelines:
- Keep messages concise and practical
- Only create flashcards when you have enough information
- Each flashcard should have a clear term and accurate definition
- Don't repeat cards that already exist
- If you're not creating cards, just provide a message with an empty flashcards array`

const STUDY_GUIDE_SYSTEM_PROMPT = `You are SubjectFocus, an assistant that helps students create comprehensive study guides.

When responding, you should provide:
1. A helpful message to the user
2. HTML content for their study guide (optional)

Your response must be valid JSON matching this structure:
{
  "message": "Your helpful response to the user",
  "content": "<p>HTML formatted study guide content</p>"
}

Guidelines:
- Create well-structured, educational content
- Use proper HTML formatting: <h1>, <h2>, <p>, <ul>, <ol>, <strong>, <em>, <blockquote>
- Keep content clear, concise, and easy to understand
- Break complex topics into digestible sections
- Include examples and explanations where appropriate
- If the user asks a question or for clarification, just provide a message without content
- The content field should contain study guide material to be inserted into their document`

function formatContext(context = {}) {
  const parts = []
  const isStudyGuide = context.mode === 'study_guide'

  if (context.study_set_id) parts.push(`Study set ID: ${context.study_set_id}`)
  if (context.title) parts.push(`Title: ${context.title}`)
  if (context.subject) parts.push(`Subject area: ${context.subject}`)
  if (context.description) parts.push(`Description: ${context.description}`)

  if (isStudyGuide) {
    if (context.currentContent) {
      parts.push(`Current guide content:\n${context.currentContent}`)
    }
    if (Array.isArray(context.cards) && context.cards.length > 0) {
      const sample = context.cards
        .slice(-10)
        .map(card => `- ${card.term || card.question}: ${card.definition || card.answer}`)
        .join('\n')
      parts.push(`Available flashcards for reference:\n${sample}`)
    }
  } else {
    if (Array.isArray(context.cards) && context.cards.length > 0) {
      const sample = context.cards
        .slice(-10)
        .map(card => `- ${card.term || card.question}: ${card.definition || card.answer}`)
        .join('\n')
      parts.push(`Existing flashcards:\n${sample}`)
    }
  }

  if (!parts.length) return ''
  return `\n\nContext about the current study set:\n${parts.join('\n')}`
}

export async function runAssistantChat({ apiKey, messages, context = {}, temperature, user_id }) {
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

  const isStudyGuide = context.mode === 'study_guide'
  const systemPrompt = isStudyGuide ? STUDY_GUIDE_SYSTEM_PROMPT : FLASHCARD_SYSTEM_PROMPT
  const systemMessage = systemPrompt + formatContext(context)

  // Define response schema based on mode
  const responseSchema = isStudyGuide ? {
    name: "study_guide_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Response message to the user"
        },
        content: {
          type: "string",
          description: "HTML formatted study guide content to insert"
        }
      },
      required: ["message", "content"],
      additionalProperties: false
    }
  } : {
    name: "flashcard_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Response message to the user"
        },
        flashcards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              term: { type: "string" },
              definition: { type: "string" }
            },
            required: ["term", "definition"],
            additionalProperties: false
          }
        }
      },
      required: ["message", "flashcards"],
      additionalProperties: false
    }
  }

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      ...messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }))
    ],
    response_format: {
      type: "json_schema",
      json_schema: responseSchema
    }
  }

  if (typeof temperature === 'number') payload.temperature = temperature

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()
  
  console.log('=== OPENAI RESPONSE ===')
  console.log(JSON.stringify(data, null, 2))

  if (!response.ok) {
    const error = new Error('OpenAI request failed')
    error.status = response.status
    error.body = data
    throw error
  }

  // Parse the structured JSON output
  let result
  try {
    const content = data.choices[0].message.content
    result = JSON.parse(content)
  } catch (err) {
    console.error('Failed to parse OpenAI response', err)
    throw new Error('Invalid response format from OpenAI')
  }

  // For study guide mode, return content directly
  if (isStudyGuide) {
    return {
      message: result.message || '',
      content: result.content || ''
    }
  }

  // For flashcard mode, execute tool calls on the server if possible
  const executed = []
  if (supabaseService && result.flashcards && result.flashcards.length > 0) {
    for (const card of result.flashcards) {
      const targetId = context.study_set_id
      if (!targetId) {
        executed.push({ ...card, error: 'Missing study_set_id' })
        continue
      }
      try {
        const { data: inserted, error } = await supabaseService
          .from('flashcards')
          .insert({
            study_set_id: targetId,
            question: card.term,
            answer: card.definition,
          })
          .select('id, question, answer')
          .single()

        if (error) throw error
        executed.push({
          id: inserted.id,
          term: card.term,
          definition: card.definition,
          study_set_id: targetId
        })
      } catch (err) {
        console.error('Failed to persist flashcard', err)
        executed.push({ ...card, study_set_id: targetId, error: String(err.message || err) })
      }
    }
  } else {
    executed.push(...(result.flashcards || []))
  }

  return {
    message: result.message || '',
    flashcards: executed
  }
}
