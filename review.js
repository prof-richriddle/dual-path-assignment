/* JMS review tools. No account or server required. */
(() => {
  'use strict';
  const key = 'student-agency-storyboard-review-v1';
  const articles = [...document.querySelectorAll('article')];
  const message = document.querySelector('#review-message');
  const reviewer = document.querySelector('#reviewer');
  const blank = () => ({version: 1, reviewer: 'JMS', segments: {}});
  let state = blank();
  let selected = null;
  const say = text => { message.textContent = text; };
  function valid(data) {
    if (!data || data.version !== 1 || typeof data.reviewer !== 'string' || !data.segments || typeof data.segments !== 'object') return false;
    return Object.entries(data.segments).every(([id, row]) => {
      const article = articles.find(a => a.id === id);
      if (!article || !row || typeof row.comment !== 'string' || !['Not reviewed', 'Looks good', 'Needs revision'].includes(row.status) || !Array.isArray(row.highlights)) return false;
      const paragraphs = [...article.querySelectorAll(':scope > p')];
      return row.highlights.every(h => h && Number.isInteger(h.paragraph) && paragraphs[h.paragraph] && Number.isInteger(h.start) && Number.isInteger(h.end) && h.start >= 0 && h.end > h.start && typeof h.quote === 'string' && h.quote.length > 0);
    });
  }
  // Preserve comments after wording changes; restore only matching highlights.
  function reconcile(data) {
    let removed = 0;
    Object.entries(data.segments).forEach(([id, row]) => {
      const paragraphs = [...document.getElementById(id).querySelectorAll(':scope > p')];
      const accepted = [];
      row.highlights.forEach(h => {
        const text = paragraphs[h.paragraph].textContent;
        if (text.slice(h.start, h.end) !== h.quote) {
          const start = text.indexOf(h.quote);
          if (start < 0 || text.indexOf(h.quote, start + 1) >= 0) { removed++; return; }
          h.start = start; h.end = start + h.quote.length;
        }
        if (accepted.some(old => old.paragraph === h.paragraph && old.start < h.end && old.end > h.start)) { removed++; return; }
        accepted.push(h);
      });
      row.highlights = accepted;
    });
    return removed;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (valid(saved)) {
      const removed = reconcile(saved);
      state = saved;
      if (removed) say('Comments and statuses restored. Some highlights referred to wording that has changed; select the revised wording to highlight it again.');
    }
  } catch (_) { say('Browser saving is unavailable. Download your feedback before leaving.'); }
  function save() {
    state.reviewer = reviewer.value;
    try { localStorage.setItem(key, JSON.stringify(state)); say('Review saved in this browser. Download feedback to share it.'); }
    catch (_) { say('Browser saving is unavailable. Download your feedback before leaving.'); }
  }
  function rowFor(id) {
    return state.segments[id] ||= {status: 'Not reviewed', comment: '', highlights: []};
  }
  function textPoint(element, offset) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (offset <= node.length) return [node, offset];
      offset -= node.length;
    }
    throw new Error('Selection no longer matches text.');
  }
  function renderHighlights(article) {
    const paragraphs = [...article.querySelectorAll(':scope > p')];
    paragraphs.forEach(p => {
      p.querySelectorAll('mark').forEach(mark => mark.replaceWith(...mark.childNodes));
      p.normalize();
    });
    const list = article.querySelector('.highlight-list');
    list.replaceChildren();
    const row = rowFor(article.id);
    [...row.highlights].sort((a,b) => b.paragraph-a.paragraph || b.start-a.start).forEach(h => {
      const p = paragraphs[h.paragraph];
      const start = textPoint(p, h.start), end = textPoint(p, h.end);
      const range = document.createRange();
      range.setStart(...start); range.setEnd(...end);
      const mark = document.createElement('mark');
      mark.append(range.extractContents()); range.insertNode(mark);
    });
    row.highlights.forEach((h, i) => {
      const item = document.createElement('li');
      item.append(document.createTextNode('“' + h.quote.trim() + '” '));
      const remove = document.createElement('button');
      remove.textContent = 'Remove highlight'; remove.className = 'secondary';
      remove.addEventListener('click', () => { row.highlights.splice(i, 1); selected = null; renderHighlights(article); save(); });
      item.append(remove); list.append(item);
    });
  }
  articles.forEach(article => {
    const panel = document.createElement('section');
    panel.className = 'review-panel'; panel.setAttribute('aria-label', 'Review ' + article.querySelector('h2').textContent.trim());
    panel.innerHTML = `<button class="highlight-button" type="button">Highlight selected text</button>
      <ul class="highlight-list" aria-label="Highlighted text"></ul>
      <label for="status-${article.id}">Review status</label>
      <select id="status-${article.id}"><option>Not reviewed</option><option>Looks good</option><option>Needs revision</option></select>
      <label for="comment-${article.id}">Comments / suggested wording</label>
      <textarea id="comment-${article.id}" placeholder="What should Rich keep or change?"></textarea>
      <p class="print-comment"></p>`;
    article.append(panel);
    const status = panel.querySelector('select'), comment = panel.querySelector('textarea');
    const row = rowFor(article.id);
    status.value = row.status; comment.value = row.comment;
    panel.querySelector('.print-comment').textContent = row.comment;
    status.addEventListener('change', () => { rowFor(article.id).status = status.value; save(); });
    comment.addEventListener('input', () => { rowFor(article.id).comment = comment.value; panel.querySelector('.print-comment').textContent = comment.value; save(); });
    panel.querySelector('.highlight-button').addEventListener('click', () => {
      if (!selected || selected.id !== article.id) return say('Select text within one paragraph in this segment, then click Highlight selected text.');
      const h = selected, row = rowFor(article.id);
      if (row.highlights.some(old => old.paragraph === h.paragraph && old.start < h.end && old.end > h.start)) return say('That selection overlaps an existing highlight. Remove the earlier highlight first.');
      row.highlights.push({paragraph:h.paragraph, start:h.start, end:h.end, quote:h.quote});
      selected = null; window.getSelection().removeAllRanges(); renderHighlights(article); save();
    });
    renderHighlights(article);
  });
  reviewer.value = state.reviewer;
  reviewer.addEventListener('input', save);
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    selected = null;
    const range = selection.getRangeAt(0);
    const parent = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const p = parent(range.startContainer).closest('article > p');
    if (!p || parent(range.endContainer).closest('article > p') !== p || !selection.toString().trim()) return;
    const before = range.cloneRange(); before.selectNodeContents(p); before.setEnd(range.startContainer, range.startOffset);
    const article = p.closest('article');
    const start = before.toString().length;
    selected = {id:article.id, paragraph:[...article.querySelectorAll(':scope > p')].indexOf(p), start, end:start+range.toString().length, quote:range.toString()};
  });
  function download(filename, data, type) {
    const url = URL.createObjectURL(new Blob([data], {type}));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.querySelector('#download-notes').addEventListener('click', () => {
    save();
    let text = `# Student Agency storyboard feedback\n\nReviewer: ${state.reviewer}\nDate: ${new Date().toLocaleString()}\n`;
    articles.forEach(article => {
      const row = rowFor(article.id);
      text += `\n## ${article.querySelector('h2').textContent.trim()}\n\nStatus: ${row.status}\n`;
      row.highlights.forEach(h => { text += `\nHighlighted text: “${h.quote.trim()}”\n`; });
      text += `\nComments:\n${row.comment || '(No comments)'}\n`;
    });
    download('storyboard-feedback.md', text, 'text/markdown;charset=utf-8');
    say('Feedback downloaded. Send that file to Rich.');
  });
  document.querySelector('#download-backup').addEventListener('click', () => { save(); download('storyboard-review.json', JSON.stringify(state, null, 2), 'application/json'); });
  document.querySelector('#load-backup').addEventListener('click', () => document.querySelector('#import-review').click());
  document.querySelector('#import-review').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!valid(data)) throw new Error('Invalid review');
      if (!window.confirm('Replace the review currently in this browser with this saved review?')) return;
      const removed = reconcile(data);
      state = data; reviewer.value = state.reviewer; selected = null;
      articles.forEach(article => {
        const row = rowFor(article.id);
        article.querySelector('select').value = row.status;
        article.querySelector('textarea').value = row.comment;
        article.querySelector('.print-comment').textContent = row.comment;
        renderHighlights(article);
      });
      save(); say(removed ? 'Review opened. Comments and statuses retained; highlights on changed wording could not be restored.' : 'Saved review opened. You can continue editing.');
    } catch (_) { say('Could not open that file. Choose a JSON file created with Save editable review.'); }
    finally { event.target.value = ''; }
  });
  document.querySelector('#print-review').addEventListener('click', () => window.print());
})();
