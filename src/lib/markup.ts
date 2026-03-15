import { getClient as getCollaboratorClient } from '@hcengineering/collaborator-client'
import { concatLink, makeCollabId, type Class, type Doc, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import { htmlToJSON, jsonToHTML, jsonToMarkup, markupToJSON } from '@hcengineering/text'
import { markdownToMarkup, markupToMarkdown } from '@hcengineering/text-markdown'
import type { ServerConfig } from '@hcengineering/api-client'
import type { MarkupFormat, MarkupOperations, MarkupRef } from '@hcengineering/api-client'

export function createMarkupOperations(
  url: string,
  workspace: WorkspaceUuid,
  token: string,
  config: ServerConfig
): MarkupOperations {
  const refUrl = concatLink(url, `/browse?workspace=${workspace}`)
  const imageUrl = concatLink(url, `/files?workspace=${workspace}&file=`)
  const collaborator = getCollaboratorClient(workspace, token, config.COLLABORATOR_URL)

  return {
    fetchMarkup: async (
      objectClass: Ref<Class<Doc>>,
      objectId: Ref<Doc>,
      objectAttr: string,
      id: MarkupRef,
      format: MarkupFormat
    ) => {
      const collabId = makeCollabId(objectClass, objectId, objectAttr)
      const markup = await collaborator.getMarkup(collabId, id)
      const json = markupToJSON(markup)

      switch (format) {
        case 'markup':
          return markup
        case 'html':
          return jsonToHTML(json)
        case 'markdown':
          return markupToMarkdown(json, { refUrl, imageUrl })
        default:
          throw new Error('Unknown content format')
      }
    },
    uploadMarkup: async (
      objectClass: Ref<Class<Doc>>,
      objectId: Ref<Doc>,
      objectAttr: string,
      value: string,
      format: MarkupFormat
    ) => {
      let markup = ''

      switch (format) {
        case 'markup':
          markup = value
          break
        case 'html':
          markup = jsonToMarkup(htmlToJSON(value))
          break
        case 'markdown':
          markup = jsonToMarkup(markdownToMarkup(value, { refUrl, imageUrl }))
          break
        default:
          throw new Error('Unknown content format')
      }

      const collabId = makeCollabId(objectClass, objectId, objectAttr)
      return await collaborator.createMarkup(collabId, markup)
    }
  }
}
