from http.server import SimpleHTTPRequestHandler, HTTPServer

class CustomRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('.tab'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()

            with open('.' + self.path, 'r') as file:
                # Read the contents of the .tab file
                content = file.read()

                # Create the HTML markup for the tab using preformatted text
                html = '<html><head><link rel="stylesheet" type="text/css" href="/style.css"></head><body><pre>{}</pre></body></html>'.format(content)

                # Encode the HTML string as bytes and send the response
                self.wfile.write(bytes(html, 'utf-8'))
        else:
            return super().do_GET()

if __name__ == '__main__':
    try:
        server = HTTPServer(('', 8000), CustomRequestHandler)
    except OSError:
        # Port 0 lets the OS pick any free port.
        server = HTTPServer(('', 0), CustomRequestHandler)
    print('Starting server at http://localhost:{}'.format(server.server_port))
    server.serve_forever()
