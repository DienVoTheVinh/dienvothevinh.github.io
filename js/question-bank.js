(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VinhMathQuestionBank = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.3.0';
  var QUESTION_ENVS = ['ex', 'bt', 'vd', 'cauhoi', 'question', 'baitap'];
  var QUESTION_ENV_SET = QUESTION_ENVS.reduce(function (result, name) {
    result[name] = true;
    return result;
  }, Object.create(null));
  var DIFFICULTY_MAP = {
    N: 'NB',
    H: 'TH',
    V: 'VD',
    G: 'VDC',
    C: 'VDC',
    // Common legacy aliases found in older ex_test collections.
    B: 'NB',
    Y: 'NB',
    T: 'TH',
    K: 'VD'
  };
  var DIFFICULTY_RANK = { NB: 1, TH: 2, VD: 3, VDC: 4 };

  function normalizeNewlines(value) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  }

  function normalizeForHash(value) {
    return normalizeNewlines(value)
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  function normalizeQuestionForDedupe(value) {
    return normalizeNewlines(value)
      .replace(/^(\\begin\{(?:ex|bt)\})%\[[^\]\r\n]+\]/i, '$1')
      .replace(/(^|[^\\])%[^\r\n]*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function utf8Bytes(value) {
    var text = String(value == null ? '' : value);
    if (typeof TextEncoder !== 'undefined') {
      return Array.prototype.slice.call(new TextEncoder().encode(text));
    }
    var bytes = [];
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        var low = text.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i += 1;
        }
      }
      if (code <= 0x7f) {
        bytes.push(code);
      } else if (code <= 0x7ff) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code <= 0xffff) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return bytes;
  }

  // Two seeded FNV-1a passes provide a deterministic 64-bit-looking value
  // without relying on BigInt, so the same result works in older browsers too.
  function hashText(value) {
    var bytes = utf8Bytes(normalizeForHash(value));
    var first = 0x811c9dc5;
    var second = 0x9e3779b9;
    for (var i = 0; i < bytes.length; i += 1) {
      first ^= bytes[i];
      first = Math.imul(first, 0x01000193) >>> 0;
      second ^= bytes[i] + (i & 0xff);
      second = Math.imul(second, 0x01000193) >>> 0;
    }
    return ('00000000' + first.toString(16)).slice(-8) + ('00000000' + second.toString(16)).slice(-8);
  }

  function isEscaped(text, index) {
    var slashes = 0;
    for (var i = index - 1; i >= 0 && text.charAt(i) === '\\'; i -= 1) slashes += 1;
    return slashes % 2 === 1;
  }

  // Replace comments with spaces while preserving character offsets. Metadata
  // is deliberately read from the untouched source later.
  function maskComments(value) {
    var text = normalizeNewlines(value);
    var output = text.split('');
    var inComment = false;
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (!inComment && ch === '%' && !isEscaped(text, i)) inComment = true;
      if (inComment && ch !== '\n') output[i] = ' ';
      if (ch === '\n') inComment = false;
    }
    return output.join('');
  }

  function readBalanced(text, start, openChar, closeChar) {
    if (text.charAt(start) !== openChar) return null;
    var depth = 0;
    for (var i = start; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (isEscaped(text, i)) continue;
      if (ch === openChar) depth += 1;
      if (ch === closeChar) {
        depth -= 1;
        if (depth === 0) {
          return {
            start: start,
            end: i + 1,
            value: text.slice(start + 1, i)
          };
        }
      }
    }
    return null;
  }

  function skipTrivia(text, start) {
    var index = start;
    while (index < text.length) {
      if (/\s/.test(text.charAt(index))) {
        index += 1;
        continue;
      }
      if (text.charAt(index) === '%' && !isEscaped(text, index)) {
        var lineEnd = text.indexOf('\n', index);
        index = lineEnd === -1 ? text.length : lineEnd + 1;
        continue;
      }
      break;
    }
    return index;
  }

  function findQuestionBlocks(tex) {
    var source = normalizeNewlines(tex);
    var masked = maskComments(source);
    var tokenRegex = /\\(begin|end)\s*\{\s*(ex|bt|vd|cauhoi|question|baitap)\s*\}/gi;
    var stack = [];
    var blocks = [];
    var errors = [];
    var match;

    while ((match = tokenRegex.exec(masked))) {
      var action = match[1].toLowerCase();
      var environment = match[2].toLowerCase();
      if (action === 'begin') {
        stack.push({
          environment: environment,
          start: match.index,
          bodyStart: tokenRegex.lastIndex
        });
        continue;
      }

      var foundAt = -1;
      for (var i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].environment === environment) {
          foundAt = i;
          break;
        }
      }
      if (foundAt === -1) {
        errors.push({ code: 'UNMATCHED_END', environment: environment, offset: match.index });
        continue;
      }
      var open = stack.splice(foundAt, 1)[0];
      blocks.push({
        environment: environment,
        start: open.start,
        bodyStart: open.bodyStart,
        bodyEnd: match.index,
        end: tokenRegex.lastIndex,
        raw_tex: source.slice(open.start, tokenRegex.lastIndex),
        inner_tex: source.slice(open.bodyStart, match.index)
      });
    }

    stack.forEach(function (open) {
      errors.push({ code: 'UNCLOSED_BEGIN', environment: open.environment, offset: open.start });
    });
    blocks.sort(function (a, b) { return a.start - b.start; });
    return { blocks: blocks, errors: errors };
  }

  function addQuestionIdCandidate(candidates, seen, value, syntax) {
    var parsed = parseQuestionId(value);
    if (!parsed) return;
    if (!seen[parsed.id]) {
      seen[parsed.id] = {
        id: parsed.id,
        syntaxes: []
      };
      candidates.push(seen[parsed.id]);
    }
    if (seen[parsed.id].syntaxes.indexOf(syntax) === -1) {
      seen[parsed.id].syntaxes.push(syntax);
    }
  }

  function findUnescapedPercent(text, start) {
    for (var i = start || 0; i < text.length; i += 1) {
      if (text.charAt(i) === '%' && !isEscaped(text, i)) return i;
    }
    return -1;
  }

  // Recovery is deliberately limited to the leading metadata comment attached
  // to the environment header. Looking through question/solution comments would
  // risk borrowing a taxonomy code from quoted source material.
  function leadingQuestionComments(rawTex) {
    var source = normalizeNewlines(rawTex);
    var environmentMatch = /\\begin\s*\{\s*(ex|bt|vd|cauhoi|question|baitap)\s*\}/i.exec(maskComments(source));
    if (!environmentMatch) return [];
    var comments = [];
    var cursor = environmentMatch.index + environmentMatch[0].length;
    var firstLine = true;

    while (cursor <= source.length) {
      var lineEnd = source.indexOf('\n', cursor);
      if (lineEnd === -1) lineEnd = source.length;
      var line = source.slice(cursor, lineEnd);
      var percent = findUnescapedPercent(line, 0);
      if (percent !== -1 && !/\S/.test(line.slice(0, percent))) {
        comments.push(line.slice(percent + 1));
      } else if (/\S/.test(line)) {
        break;
      } else if (!firstLine && comments.length) {
        // A blank line ends the metadata envelope once comments have started.
        break;
      }
      if (lineEnd >= source.length) break;
      cursor = lineEnd + 1;
      firstLine = false;
    }
    return comments;
  }

  function relaxedQuestionIdCandidates(rawTex) {
    var candidates = [];
    var seen = Object.create(null);
    var tokenRegex = /(?:[012][A-Za-z]\d+[A-Za-z]\d+-\d+)|(?:[A-Za-z0-9][A-Za-z0-9._-]{2,31}:(?:[1-9]|1[0-2])[A-Za-z](?:0|[1-9]\d*)(?:NB|TH|VD|VDC)(?:0|[1-9]\d*)-[A-Za-z0-9][A-Za-z0-9-]{0,23}(?![A-Za-z0-9-]))/g;

    leadingQuestionComments(rawTex).forEach(function (comment) {
      var match;
      while ((match = tokenRegex.exec(comment))) {
        var before = comment.slice(0, match.index);
        var openMatch = /\[\s*$/.exec(before);
        if (!openMatch) continue;
        var openIndex = openMatch.index;
        var after = comment.slice(tokenRegex.lastIndex);
        var closeMatch = /^\s*\]/.exec(after);
        var syntax = null;

        if (closeMatch) {
          var beforeOpen = before.slice(0, openIndex);
          var afterClose = after.slice(closeMatch[0].length);
          if (/\[\s*$/.test(beforeOpen) && /^\s*\]/.test(afterClose)) {
            syntax = 'double_bracket';
          } else if (/\]\s*$/.test(beforeOpen)) {
            syntax = 'unprefixed_bracket';
          }
        } else if (/^\s*(?:%|$)/.test(after)) {
          syntax = 'missing_closing_bracket';
        }

        if (syntax) addQuestionIdCandidate(candidates, seen, match[0], syntax);
      }
    });
    return candidates;
  }

  function analyzeQuestionIds(rawTex) {
    var source = normalizeNewlines(rawTex);
    var standard = [];
    var standardSeen = Object.create(null);
    var regex = /%\s*\[\s*((?:[012][A-Za-z]\d+[A-Za-z]\d+-\d+)|(?:[A-Za-z0-9][A-Za-z0-9._-]{2,31}:(?:[1-9]|1[0-2])[A-Za-z](?:0|[1-9]\d*)(?:NB|TH|VD|VDC)(?:0|[1-9]\d*)-[A-Za-z0-9][A-Za-z0-9-]{0,23}))\s*\]/g;
    var match;
    while ((match = regex.exec(source))) {
      addQuestionIdCandidate(standard, standardSeen, match[1], 'standard_comment');
    }

    var relaxed = relaxedQuestionIdCandidates(source);
    var all = [];
    var allSeen = Object.create(null);
    standard.concat(relaxed).forEach(function (candidate) {
      candidate.syntaxes.forEach(function (syntax) {
        addQuestionIdCandidate(all, allSeen, candidate.id, syntax);
      });
    });

    var recovered = standard.length === 0 && all.length === 1;
    var selected = standard.length ? standard[0].id : (recovered ? all[0].id : null);
    var warnings = [];
    if (all.length > 1) {
      warnings.push({
        code: 'MULTIPLE_QUESTION_IDS',
        candidates: all.map(function (candidate) { return candidate.id; })
      });
    }
    return {
      id: selected,
      candidates: all.map(function (candidate) { return candidate.id; }),
      recovered: recovered,
      recovery_syntax: recovered ? all[0].syntaxes[0] : null,
      warnings: warnings
    };
  }

  function extractQuestionId(rawTex) {
    return analyzeQuestionIds(rawTex).id;
  }

  function parseQuestionId(value) {
    var id = String(value == null ? '' : value).trim().toUpperCase();
    // Chuẩn NganHangTHPT1.x của tác giả gốc:
    // <khối><mảng><chương><mức><bài/kỹ năng>-<dạng số>.
    // Không nới lỏng hậu tố thành nhãn chữ vì sẽ làm mất khả năng đối chiếu
    // trực tiếp với id_map.json và khiến cùng một dạng có nhiều mã khác nhau.
    var match = /^([012])([A-Z])(\d+)([NBYHTVKGC])(\d+)-(\d+)$/.exec(id);
    if (match) {
      var gradeLookup = { '0': 10, '1': 11, '2': 12 };
      var grade = gradeLookup[match[1]] || null;
      var area = match[2];
      var chapter = Number(match[3]);
      var difficultyCode = match[4];
      var skill = Number(match[5]);
      var variant = match[6];
      var topicCode = match[1] + area + match[3];
      var skillFamily = topicCode + '?' + match[5];
      // id_map/idvn_map deliberately replace difficulty with `?`: questions
      // sharing this full key are the same mathematical form at potentially
      // different cognitive levels. The final segment is therefore part of the
      // family, not a per-question UID.
      var taxonomyKey = skillFamily + '-' + variant;
      var difficulty = DIFFICULTY_MAP[difficultyCode] || null;
      return {
        id: id,
        schema_name: 'legacy-v1',
        grade: grade,
        grade_code: match[1],
        area: area,
        chapter: chapter,
        chapter_code: topicCode,
        topic_code: topicCode,
        difficulty_code: difficultyCode,
        difficulty: difficulty,
        difficulty_rank: difficulty ? DIFFICULTY_RANK[difficulty] : null,
        skill: skill,
        skill_code: match[1] + area + match[3] + difficultyCode + match[5],
        skill_family: skillFamily,
        variant: variant,
        taxonomy_key: taxonomyKey,
        similarity_key: taxonomyKey
      };
    }

    // Future curricula use a namespaced canonical envelope. This does not
    // reinterpret or loosen legacy-v1, and lets Grade 6-9 catalogues coexist.
    match = /^([A-Z0-9][A-Z0-9._-]{2,31}):([1-9]|1[0-2])([A-Z])(0|[1-9]\d*)(NB|TH|VD|VDC)(0|[1-9]\d*)-([A-Z0-9][A-Z0-9-]{0,23})$/.exec(id);
    if (!match) return null;
    var schemaName = match[1].toLowerCase();
    var customGrade = Number(match[2]);
    var customArea = match[3];
    var customChapter = Number(match[4]);
    var customDifficulty = match[5];
    var customSkill = Number(match[6]);
    var customVariant = match[7];
    var customId = schemaName + ':' + match[2] + customArea + match[4] + customDifficulty + match[6] + '-' + customVariant;
    var customTopicCode = schemaName + ':' + match[2] + customArea + match[4];
    var customSkillFamily = customTopicCode + '?' + match[6];
    var customTaxonomyKey = customSkillFamily + '-' + customVariant;
    return {
      id: customId,
      schema_name: schemaName,
      grade: customGrade,
      grade_code: match[2],
      area: customArea,
      chapter: customChapter,
      chapter_code: customTopicCode,
      topic_code: customTopicCode,
      difficulty_code: customDifficulty,
      difficulty: customDifficulty,
      difficulty_rank: DIFFICULTY_RANK[customDifficulty] || null,
      skill: customSkill,
      skill_code: customTopicCode + customDifficulty + match[6],
      skill_family: customSkillFamily,
      variant: customVariant,
      taxonomy_key: customTaxonomyKey,
      similarity_key: customTaxonomyKey
    };
  }

  function findCommand(masked, names, before) {
    var limit = typeof before === 'number' ? before : masked.length;
    var regex = new RegExp('\\\\(' + names.join('|') + ')\\b', 'gi');
    var match;
    while ((match = regex.exec(masked))) {
      if (match.index >= limit) return null;
      return { name: match[1], start: match.index, commandEnd: regex.lastIndex };
    }
    return null;
  }

  function findCommands(masked, names, before) {
    var limit = typeof before === 'number' ? before : masked.length;
    var regex = new RegExp('\\\\(' + names.join('|') + ')\\b', 'gi');
    var commands = [];
    var match;
    while ((match = regex.exec(masked))) {
      if (match.index >= limit) break;
      commands.push({ name: match[1], start: match.index, commandEnd: regex.lastIndex });
    }
    return commands;
  }

  function parseCommandArguments(source, command, count) {
    if (!command) return null;
    var index = skipTrivia(source, command.commandEnd);
    var option = null;
    if (source.charAt(index) === '[') {
      var optional = readBalanced(source, index, '[', ']');
      if (optional) {
        option = optional.value.trim();
        index = skipTrivia(source, optional.end);
      }
    }
    var args = [];
    while (args.length < count && source.charAt(index) === '{') {
      var argument = readBalanced(source, index, '{', '}');
      if (!argument) break;
      args.push(argument);
      index = skipTrivia(source, argument.end);
    }
    return {
      name: command.name,
      start: command.start,
      end: args.length ? args[args.length - 1].end : index,
      option: option,
      args: args
    };
  }

  function extractSolution(source, masked) {
    var command = findCommand(masked, ['loigiai', 'giaibai', 'solution']);
    var commandData = parseCommandArguments(source, command, 1);
    var envRegex = /\\begin\s*\{\s*solution\s*\}/i;
    var envMatch = envRegex.exec(masked);
    var environmentData = null;
    if (envMatch) {
      var envBodyStart = envMatch.index + envMatch[0].length;
      var endRegex = /\\end\s*\{\s*solution\s*\}/ig;
      endRegex.lastIndex = envBodyStart;
      var endMatch = endRegex.exec(masked);
      if (endMatch) {
        environmentData = {
          name: 'solution',
          start: envMatch.index,
          end: endRegex.lastIndex,
          value: source.slice(envBodyStart, endMatch.index).trim(),
          syntax: 'environment'
        };
      }
    }

    if (environmentData && (!commandData || environmentData.start < commandData.start)) return environmentData;
    if (!commandData || !commandData.args.length) return null;
    return {
      name: commandData.name.toLowerCase(),
      start: commandData.start,
      end: commandData.end,
      value: commandData.args[0].value.trim(),
      syntax: 'command'
    };
  }

  // Clean VinhMath exports intentionally normalize short-answer questions to
  // `bt + loigiai` so they compile with the site's ex_test environment. Keep
  // that canonical form round-trippable when an admin uploads the clean TeX
  // again: the answer is the first paragraph after the fixed marker and any
  // following paragraph remains the worked solution.
  function extractCanonicalShortSolution(solution) {
    if (!solution || !solution.value) return null;
    var source = normalizeNewlines(solution.value);
    var masked = maskComments(source);
    var marker = /^\s*\\textbf\b/i.exec(masked);
    if (!marker) return null;
    var argumentStart = skipTrivia(masked, marker.index + marker[0].length);
    var label = readBalanced(source, argumentStart, '{', '}');
    if (!label) return null;
    var normalizedLabel = label.value.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalizedLabel !== 'câu trả lời:' && normalizedLabel !== 'cau tra loi:') return null;

    var remainder = source.slice(label.end).replace(/^\s+/, '');
    var separator = /\n[ \t]*\n/.exec(remainder);
    var answer = (separator ? remainder.slice(0, separator.index) : remainder).trim();
    if (!answer) return null;
    return {
      answer: answer,
      solution: separator ? remainder.slice(separator.index + separator[0].length).trim() : ''
    };
  }

  function stripTrueMarker(value) {
    var source = String(value == null ? '' : value);
    var matched = /^\s*\\True\b\s*/.test(source);
    return {
      correct: matched,
      tex: source.replace(/^\s*\\True\b\s*/, '').trim()
    };
  }

  function removeRanges(source, ranges) {
    var ordered = ranges
      .filter(function (range) { return range && range.end > range.start; })
      .sort(function (a, b) { return b.start - a.start; });
    var output = source;
    ordered.forEach(function (range) {
      output = output.slice(0, range.start) + output.slice(range.end);
    });
    return output;
  }

  function stripLeadingMetadata(source) {
    var text = normalizeNewlines(source);
    var changed = true;
    while (changed) {
      changed = false;
      var next = text
        .replace(/^\s*(?:%\s*\[[^\]\r\n]*\]\s*)+(?:\n|$)/i, '')
        .replace(/^\s*%\s*C(?:âu|au)\s*\d+[^\r\n]*(?:\n|$)/i, '');
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
    return text.replace(/^\s+|\s+$/g, '');
  }

  function detectAssets(rawTex) {
    var source = normalizeNewlines(rawTex);
    var masked = maskComments(source);
    var refs = [];
    var seen = Object.create(null);
    var commandRegex = /\\(includegraphics|pgfimage|includepdf|input|include|lstinputlisting)(?:\s*\[[^\]]*\])?\s*\{([^{}]+)\}/gi;
    var match;
    while ((match = commandRegex.exec(masked))) {
      var command = match[1].toLowerCase();
      var path = source.slice(match.index, commandRegex.lastIndex).match(/\{([^{}]+)\}\s*$/);
      path = path ? path[1].trim() : match[2].trim();
      var key = command + '|' + path;
      if (seen[key]) continue;
      seen[key] = true;
      refs.push({
        kind: /^(includegraphics|pgfimage|includepdf)$/.test(command) ? 'media' : 'file',
        command: command,
        path: path,
        external: true
      });
    }
    var embedded = [];
    [
      ['tikz', /\\begin\s*\{\s*tikzpicture\s*\}/i],
      ['asy', /\\begin\s*\{\s*asy\s*\}/i],
      ['pstricks', /\\begin\s*\{\s*pspicture\s*\}/i]
    ].forEach(function (entry) {
      if (entry[1].test(masked)) embedded.push(entry[0]);
    });
    return {
      has_assets: refs.length > 0 || embedded.length > 0,
      asset_refs: refs,
      embedded_graphics: embedded
    };
  }

  function canonicalChoiceCommand(kind, choices) {
    var command = kind === 'true_false' ? '\\choiceTF' : '\\choice';
    var lines = [command];
    choices.forEach(function (choice) {
      lines.push('{ ' + (choice.correct ? '\\True ' : '') + choice.tex.trim() + ' }');
    });
    return lines.join('\n');
  }

  function buildCanonical(question) {
    var environment = question.normalized_environment;
    var header = '\\begin{' + environment + '}' + (question.question_id ? '%[' + question.question_id + ']' : '');
    var parts = [header];
    if (question.content_tex) parts.push(question.content_tex.trim());
    if (question.type === 'multiple_choice' || question.type === 'true_false') {
      parts.push(canonicalChoiceCommand(question.type, question.choices));
    }
    if (question.type === 'short_answer') {
      var shortSolution = '\\textbf{Câu trả lời:} ' + String(question.short_answer || '').trim();
      if (question.solution_tex) shortSolution += '\n\n' + question.solution_tex.trim();
      parts.push('\\loigiai{' + shortSolution + '}');
    } else if (question.solution_tex) {
      parts.push('\\loigiai{' + question.solution_tex.trim() + '}');
    }
    parts.push('\\end{' + environment + '}');
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function parseQuestionBlock(rawBlock, options) {
    options = options || {};
    var rawTex = typeof rawBlock === 'string' ? normalizeNewlines(rawBlock) : normalizeNewlines(rawBlock.raw_tex);
    var environmentMatch = /\\begin\s*\{\s*(ex|bt|vd|cauhoi|question|baitap)\s*\}/i.exec(maskComments(rawTex));
    if (!environmentMatch) return null;
    var rawEnvironment = environmentMatch[1].toLowerCase();
    var endRegex = new RegExp('\\\\end\\s*\\{\\s*' + rawEnvironment + '\\s*\\}', 'ig');
    var endMatch;
    var lastEnd = null;
    while ((endMatch = endRegex.exec(maskComments(rawTex)))) lastEnd = endMatch;
    if (!lastEnd) return null;

    var bodyStart = environmentMatch.index + environmentMatch[0].length;
    var body = rawTex.slice(bodyStart, lastEnd.index);
    var maskedBody = maskComments(body);
    var solution = extractSolution(body, maskedBody);
    var beforeSolution = solution ? solution.start : body.length;
    var tfCommand = findCommand(maskedBody, ['choiceTF'], beforeSolution);
    var mcCommand = tfCommand ? null : findCommand(maskedBody, ['choice'], beforeSolution);
    var shortCommands = (tfCommand || mcCommand) ? [] : findCommands(maskedBody, ['shortans'], beforeSolution);
    var choiceData = parseCommandArguments(body, tfCommand || mcCommand, 4);
    var shortDataList = shortCommands
      .map(function (command) { return parseCommandArguments(body, command, 1); })
      .filter(function (data) { return data && data.args.length; });
    var shortData = shortDataList.length ? shortDataList[shortDataList.length - 1] : null;
    var canonicalShort = (!tfCommand && !mcCommand && rawEnvironment === 'bt')
      ? extractCanonicalShortSolution(solution)
      : null;
    var type = 'essay';
    if (tfCommand) type = 'true_false';
    else if (mcCommand) type = 'multiple_choice';
    else if ((shortData && shortData.args.length) || canonicalShort) type = 'short_answer';

    var choices = [];
    if (choiceData) {
      choiceData.args.forEach(function (argument, index) {
        var parsed = stripTrueMarker(argument.value);
        choices.push({
          index: index,
          label: String.fromCharCode(65 + index),
          tex: parsed.tex,
          correct: parsed.correct
        });
      });
    }
    var ranges = [];
    if (choiceData) ranges.push({ start: choiceData.start, end: choiceData.end });
    shortDataList.forEach(function (data) {
      ranges.push({ start: data.start, end: data.end });
    });
    if (solution) ranges.push({ start: solution.start, end: solution.end });
    var content = stripLeadingMetadata(removeRanges(body, ranges));
    var questionIdAnalysis = analyzeQuestionIds(rawTex);
    var questionId = questionIdAnalysis.id;
    var idInfo = questionId ? parseQuestionId(questionId) : null;
    var assets = detectAssets(rawTex);
    var normalizedEnvironment = (type === 'multiple_choice' || type === 'true_false') ? 'ex' : 'bt';
    var question = {
      uid: null,
      source_hash: hashText(rawTex),
      canonical_hash: null,
      source_path: options.sourcePath || options.source_path || null,
      source_index: typeof options.index === 'number' ? options.index : null,
      raw_environment: rawEnvironment,
      normalized_environment: normalizedEnvironment,
      type: type,
      question_id: questionId,
      question_id_candidates: questionIdAnalysis.candidates,
      question_id_recovered: questionIdAnalysis.recovered,
      question_id_recovery_syntax: questionIdAnalysis.recovery_syntax,
      parser_warnings: questionIdAnalysis.warnings,
      id_info: idInfo,
      grade: idInfo ? idInfo.grade : null,
      area: idInfo ? idInfo.area : null,
      chapter: idInfo ? idInfo.chapter : null,
      chapter_code: idInfo ? idInfo.chapter_code : null,
      topic_code: idInfo ? idInfo.topic_code : null,
      difficulty: idInfo ? idInfo.difficulty : null,
      difficulty_code: idInfo ? idInfo.difficulty_code : null,
      difficulty_rank: idInfo ? idInfo.difficulty_rank : null,
      skill: idInfo ? idInfo.skill : null,
      skill_code: idInfo ? idInfo.skill_code : null,
      skill_family: idInfo ? idInfo.skill_family : null,
      variant: idInfo ? idInfo.variant : null,
      taxonomy_key: idInfo ? idInfo.taxonomy_key : null,
      similarity_key: idInfo ? idInfo.similarity_key : null,
      content_tex: content,
      choices: choices,
      correct_choice_indexes: choices.filter(function (choice) { return choice.correct; }).map(function (choice) { return choice.index; }),
      short_answer: shortData && shortData.args.length ? shortData.args[0].value.trim() : (canonicalShort ? canonicalShort.answer : null),
      short_answer_option: shortData ? shortData.option : null,
      solution_tex: canonicalShort ? canonicalShort.solution : (solution ? solution.value : ''),
      solution_source: solution ? solution.name : null,
      has_assets: assets.has_assets,
      asset_refs: assets.asset_refs,
      embedded_graphics: assets.embedded_graphics,
      raw_tex: rawTex,
      canonical_tex: ''
    };
    question.canonical_tex = buildCanonical(question);
    question.canonical_hash = hashText(normalizeQuestionForDedupe(question.canonical_tex));
    question.uid = 'qb-' + question.canonical_hash;
    return question;
  }

  function parseDocument(tex, options) {
    options = options || {};
    var located = findQuestionBlocks(tex);
    var questions = [];
    located.blocks.forEach(function (block, index) {
      var question = parseQuestionBlock(block, {
        sourcePath: options.sourcePath || options.source_path || null,
        index: index
      });
      if (question) questions.push(question);
    });
    var counts = { total: questions.length, multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 };
    questions.forEach(function (question) {
      counts[question.type] = (counts[question.type] || 0) + 1;
    });
    return {
      questions: questions,
      errors: located.errors,
      stats: counts
    };
  }

  function parseTex(tex, options) {
    return parseDocument(tex, options).questions;
  }

  return {
    VERSION: VERSION,
    QUESTION_ENVIRONMENTS: QUESTION_ENVS.slice(),
    DIFFICULTY_MAP: Object.assign({}, DIFFICULTY_MAP),
    DIFFICULTY_RANK: Object.assign({}, DIFFICULTY_RANK),
    hashText: hashText,
    normalizeQuestionForDedupe: normalizeQuestionForDedupe,
    maskComments: maskComments,
    findQuestionBlocks: findQuestionBlocks,
    analyzeQuestionIds: analyzeQuestionIds,
    extractQuestionId: extractQuestionId,
    parseQuestionId: parseQuestionId,
    detectAssets: detectAssets,
    parseQuestionBlock: parseQuestionBlock,
    parseDocument: parseDocument,
    parseTex: parseTex,
    extractQuestions: parseTex,
    buildCanonical: buildCanonical
  };
});
