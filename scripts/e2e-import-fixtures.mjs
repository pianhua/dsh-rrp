// Build tavern-style PNG fixtures and import JSON bodies for live route tests.
import { gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function pngWith(...texts) {
  const chunks = []
  for (const [keyword, value] of texts) {
    const data = Buffer.concat([Buffer.from(keyword + '\0', 'latin1'), Buffer.from(value, 'latin1')])
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write('tEXt', 4, 'ascii')
    chunks.push(Buffer.concat([head, data, Buffer.alloc(4)]))
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks])
}

const v2 = {
  name: '沈雪衣 live-test',
  description: '边关游医，随身药箱不离手。{{user}}曾在雪夜救过其一命。',
  personality: '外冷内热，说话直。',
  first_mes: '{{char}}把药箱往柜台上一放：「抓药还是问诊？」',
  mes_example: '<START>\n{{user}}: 有金疮药吗\n{{char}}: 有，先让我看看伤。',
  scenario: '雪夜雁门客栈。',
  tags: ['游医', '边关'],
  creator: 'e2e-test',
}
const v3data = {
  name: '测试剑客 乙',
  description: '独臂剑客。',
  first_mes: '「……问路？」',
  tags: ['武侠'],
}

writeFileSync('/tmp/import-v2.json', JSON.stringify({ kind: 'png', data: pngWith(['chara', Buffer.from(JSON.stringify(v2), 'utf8').toString('base64')]).toString('base64') }))
writeFileSync('/tmp/import-v3.json', JSON.stringify({ kind: 'png', data: pngWith(['ccv3', gzipSync(Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: v3data }), 'utf8')).toString('base64')]).toString('base64') }))
writeFileSync('/tmp/import-bad.json', JSON.stringify({ kind: 'png', data: pngWith(['Software', 'paint']).toString('base64') }))
console.log('fixtures written')
