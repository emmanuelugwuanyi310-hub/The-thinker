import sys, pty, os, select, struct, fcntl, json, termios, base64, threading

def main():
    cwd = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    master, slave = pty.openpty()
    pid = os.fork()

    if pid == 0:
        os.close(master)
        os.setsid()
        try:
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
        except Exception:
            pass
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        os.close(slave)
        os.environ['TERM'] = 'xterm-256color'
        os.environ['COLORTERM'] = 'truecolor'
        try:
            os.chdir(cwd)
        except Exception:
            pass
        os.execlp('bash', 'bash', '-l')
    else:
        os.close(slave)

        def pty_to_stdout():
            while True:
                try:
                    data = os.read(master, 4096)
                    if not data:
                        break
                    payload = json.dumps({'type': 'data', 'data': base64.b64encode(data).decode('ascii')}) + '\n'
                    sys.stdout.write(payload)
                    sys.stdout.flush()
                except Exception:
                    break
            try:
                sys.stdout.write(json.dumps({'type': 'exit'}) + '\n')
                sys.stdout.flush()
            except Exception:
                pass

        t = threading.Thread(target=pty_to_stdout, daemon=True)
        t.start()

        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                msg = json.loads(line)
                mtype = msg.get('type')
                if mtype == 'input':
                    raw_data = msg.get('data', '')
                    if isinstance(raw_data, str):
                        os.write(master, raw_data.encode('utf-8'))
                elif mtype == 'resize':
                    cols = int(msg.get('cols', 80))
                    rows = int(msg.get('rows', 24))
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
            except Exception:
                break

if __name__ == '__main__':
    main()
