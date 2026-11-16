import test from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { isVideoPlatformPage, localVideoMarkdownExtensions, localVideoMarkup, networkVideoMarkup,
  parseLocalVideoReference, parseNetworkVideoReference } from '../src/local-video.js';

const marked = new Marked({ extensions: localVideoMarkdownExtensions });

test('Typora self-closing video is normalized without consuming following Markdown', () => {
  const html = marked.parse('<video src="assets/演示.mp4" />\n# 后续标题\n\n下一段');
  assert.match(html, /^<video src="assets\/演示\.mp4"><\/video>\n<h1>后续标题<\/h1>/);
  assert.match(html, /<p>下一段<\/p>/);
  assert.match(marked.parse('前文 <video src="assets/clip.mp4"/> 后文'), /<p>前文 <video src="assets\/clip\.mp4"><\/video> 后文<\/p>/);
});

test('standard videos are preserved and examples in code do not turn into players', () => {
  const markdownTag = '<video controls preload="none" src="assets/clip.mp4"></video>';
  assert.match(marked.parse(markdownTag + '\n# Next'), /^<video src="assets\/clip\.mp4"><\/video>\n<h1>Next<\/h1>/);
  for (const code of ['`<video src="example.mp4" />`', '```html\n<video src="example.mp4" />\n```', '    <video src="example.mp4" />']) {
    const html = marked.parse(code);
    assert.doesNotMatch(html, /<video\b/);
    assert.match(html, /&lt;video/);
  }
});

test('local references are escaped and retain a portable document path', () => {
  assert.equal(parseLocalVideoReference('assets/%E6%BC%94%E7%A4%BA%201.mp4'), 'assets/%E6%BC%94%E7%A4%BA%201.mp4');
  assert.equal(parseLocalVideoReference('  ./assets/例子.MP4  '), './assets/例子.MP4');
  assert.equal(parseLocalVideoReference('file:///C:/Videos/demo.mp4'), 'file:///C:/Videos/demo.mp4');
  assert.equal(parseLocalVideoReference('C:\\Videos\\demo.mp4'), 'C:\\Videos\\demo.mp4');
  assert.equal(localVideoMarkup('assets/a&b.mp4'), '<video controls preload="none" src="assets/a&amp;b.mp4"></video>');
  assert.match(marked.parse('<video src="C:\\Videos\\demo.mp4" />'), /src="C%3A\/Videos\/demo\.mp4"/);
  assert.match(marked.parse('<video src="file:///C:/Videos/demo%201.mp4" />'), /src="C%3A\/Videos\/demo%201\.mp4"/);
});

test('WebM references use the same safe standard markup and path rules as MP4', () => {
  const source = 'assets/录屏%201.WeBm';
  assert.equal(parseLocalVideoReference(source), source);
  assert.equal(parseLocalVideoReference('assets/clip%2ewebm'), 'assets/clip%2ewebm');
  assert.equal(localVideoMarkup(source), '<video controls preload="none" src="assets/录屏%201.WeBm"></video>');
  assert.match(marked.parse('<video src="file:///C:/Videos/demo%201.webm" />\n# Next'),
    /^<video src="C%3A\/Videos\/demo%201\.webm"><\/video>\n<h1>Next<\/h1>/);
});

test('network, device, traversal and unsupported local references cannot become players', () => {
  const unsupported = [
    'https://example.test/v.mp4', 'http://127.0.0.1/v.mp4', '//host/a.mp4',
    '\\\\host\\a.mp4', 'file://host/share/a.mp4', 'file:////host/a.mp4',
    '%2f%2fhost/a.mp4', 'https%3a%2f%2fhost/a.mp4', '%5c%5c%3f%5cC%3a%5cfile.mp4',
    'C:/NUL.mp4', 'C:/CON /x.mp4', 'assets/CaM.mp4.exe', 'assets/video.webm.exe', 'assets/video.ogv',
    'C:/NUL.webm', 'assets/../clip.webm', '//server/clip.webm',
    'assets/%00.mp4', 'assets/../clip.mp4', 'assets/%2e%2e/clip.mp4', 'blob:opaque.mp4',
    'assets/clip%broken.mp4', 'assets/clip.mp4?remote=yes'
  ];
  for (const reference of unsupported) {
    assert.equal(parseLocalVideoReference(reference), '', reference);
    assert.equal(localVideoMarkup(reference), '', reference);
  }
});

test('an explicit HTTPS media reference keeps extensionless signed paths and queries intact', () => {
  const signed = 'https://media.example.com/clip/%2f?Signature=a%2B%3D&Flag=+&p=%20';
  assert.equal(parseNetworkVideoReference(signed), signed);
  assert.equal(parseNetworkVideoReference('  https://video.example.com/media.mp4  '), 'https://video.example.com/media.mp4');
  assert.equal(networkVideoMarkup(signed),
    '<video controls preload="none" src="https://media.example.com/clip/%2f?Signature=a%2B%3D&amp;Flag=+&amp;p=%20"></video>');
  assert.equal(marked.parse(networkVideoMarkup(signed)),
    '<video src="https://media.example.com/clip/%2f?Signature=a%2B%3D&amp;Flag=+&amp;p=%20"></video>\n');
  assert.equal(parseLocalVideoReference(signed), '');
  assert.match(marked.parse('[Webpage](https://media.example.com/page)'), /<a href="https:\/\/media\.example\.com\/page"/);
});

test('network media rejects account details, loopback/private/obfuscated IPs, local names and known webpage hosts', () => {
  const unsupported = [
    'http://media.example.com/v.mp4', '//media.example.com/v.mp4', 'https:/media.example.com/v.mp4',
    'https://user:p@media.example.com/clip', 'https://@media.example.com/clip', 'https://media.example.com\\@localhost/v.mp4',
    'https://127.0.0.1/v.mp4', 'https://2130706433/v.mp4', 'https://0x7f000001/v.mp4', 'https://0177.1/v.mp4',
    'https://192.168.0.1/v.mp4', 'https://10.0.0.1/v.mp4', 'https://169.254.169.254/v.mp4', 'https://8.8.8.8/v.mp4',
    'https://[::1]/v.mp4', 'https://[::ffff:127.0.0.1]/v.mp4', 'https://[fd00::1]/v.mp4',
    'https://localhost/v.mp4', 'https://host.docker.internal/v.mp4', 'https://movie.LOCAL./v.mp4',
    'https://movie.home.arpa/v.mp4', 'https://www.youtube.com/watch?v=example', 'https://youtu.be/example',
    'https://player.bilibili.com/player.html?bvid=example', 'https://b23.tv/example'
  ];
  for (const reference of unsupported) {
    assert.equal(parseNetworkVideoReference(reference), '', reference);
    assert.equal(networkVideoMarkup(reference), '', reference);
  }
  assert.equal(isVideoPlatformPage('https://www.youtube.com/watch?v=example'), true);
  assert.equal(isVideoPlatformPage('https://player.bilibili.com/player.html?bvid=example'), true);
  assert.equal(isVideoPlatformPage('https://r1.example.googlevideo.com/videoplayback?sig=a%2f'), false);
  assert.ok(parseNetworkVideoReference('https://r1.example.googlevideo.com/videoplayback?sig=a%2f'));
  assert.ok(parseNetworkVideoReference('https://video.bilivideo.com/data.mp4?token=a%26b'));
});
