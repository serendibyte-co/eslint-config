export async function handler(request: Request): Promise<Response> {
  const value: unknown = await request.text()
  console.log(value)
  return new Response('ok')
}
