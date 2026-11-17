#!/usr/bin/env python3
"""Build a reproducible offline ZIP from a committed Git ref; no network or personal files."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default='HEAD')
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = Path(args.output_dir).expanduser().resolve()
    if output == root or root in output.parents:
        raise ValueError('输出目录不能位于Skill仓库内')

    def git(*argv):
        return subprocess.check_output(['git', *argv], cwd=root)

    commit = git('rev-parse', '--verify', args.ref + '^{commit}').decode().strip()
    version = git('show', commit + ':VERSION').decode().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('发布版本无效')
    entries = {}
    for row in git('ls-tree', '-r', '-z', commit).split(b'\0'):
        if not row:
            continue
        info, raw_name = row.split(b'\t', 1)
        mode, kind, blob = info.decode().split()
        name = raw_name.decode()
        if kind != 'blob' or mode not in ('100644', '100755') or '\\' in name or any(part in ('', '.', '..') for part in name.split('/')):
            raise ValueError('发布源含非法路径或非普通文件')
        if name not in ('SKILL.md', 'VERSION', 'README.md', 'CHANGELOG.md') and name.split('/')[0] not in ('agents', 'assets', 'references', 'scripts'):
            raise ValueError('发布源含非白名单文件：' + name)
        data = git('show', commit + ':' + name)
        if hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() != blob:
            raise ValueError('Git blob验证失败')
        entries['strategy-condition-config/' + name] = (data, mode, blob)
    manifest = {'version': version, 'source': 'https://github.com/wenbofan0515-afk/strategy-condition-config',
                'tag': 'v' + version, 'commit': commit, 'files': [
                    {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'git_blob_sha1': blob}
                    for name, (data, _, blob) in sorted(entries.items())]}
    instructions = f'''# 网格与策略一体化Skill离线安装\n\n版本：{version}\n提交：{commit}\n来源：https://github.com/wenbofan0515-afk/strategy-condition-config/releases/tag/v{version}\n\n先从下载来源或发送者核对ZIP的SHA-256及版本/提交，再解压至临时目录；包内清单自身不是数字签名。无需重新下载GitHub。\n\n已有Node.js 22+时，在解压包根目录运行（macOS/Linux/Windows相同）：\n\n```text\nnode strategy-condition-config/scripts/verify-package.mjs . {version} {commit}\nnode strategy-condition-config/scripts/run-tests.mjs\nnode strategy-condition-config/scripts/doctor.mjs\n```\n\n校验通过后，只将strategy-condition-config目录安装至当前Codex实际使用的skills目录；保留旧版备份及个人文件，不同时安装旧独立grid-distribution-config。安装后逐文件回读并新开会话。完整安装及PowerShell命令见strategy-condition-config/references/installation.md。\n\n如没有Node.js，可由安装代理使用已有Python或PowerShell逐文件核对manifest.json后安装技能文件，测试标记未执行，不自动联网安装依赖。缺少内部项目只代表后台适配器未就绪，不代表技能文件安装失败。不要自动登录、申请权限或执行生产配置。\n'''
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'strategy-condition-config-v{version}-offline.zip'
    if archive.exists():
        raise ValueError('输出ZIP已存在，请使用新的输出目录')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, (data, mode, _) in sorted(entries.items()):
            item = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.create_system = 3
            item.external_attr = int(mode, 8) << 16
            z.writestr(item, data)
        z.writestr(zipfile.ZipInfo('manifest.json', (2026, 1, 1, 0, 0, 0)), json.dumps(manifest, ensure_ascii=False, indent=2).encode())
        z.writestr(zipfile.ZipInfo('OFFLINE-INSTALL.md', (2026, 1, 1, 0, 0, 0)), instructions.encode())
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError('ZIP完整性验证失败')
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / (archive.name + '.sha256')).write_text(sha + '  ' + archive.name + '\n', encoding='utf-8')
    print(json.dumps({'archive': str(archive), 'sha256': sha, 'version': version, 'commit': commit, 'files': len(entries)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
