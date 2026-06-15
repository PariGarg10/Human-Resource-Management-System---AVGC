const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getUploadsRoot } = require('./storagePaths');

function lettersDir() {
  const dir = getUploadsRoot('exit-letters');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePdf(filePath, build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    build(doc);
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

async function generateRelievingLetter(employee, exitRequest) {
  const lwd = exitRequest.confirmed_last_working_day || exitRequest.last_working_day;
  const fileName = `relieving-${employee.id}-${exitRequest.id}-${Date.now()}.pdf`;
  const filePath = path.join(lettersDir(), fileName);

  await writePdf(filePath, (doc) => {
    doc.fontSize(18).fillColor('#ed1d24').text('AVGC Studios', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor('#000').text('Relieving Letter', { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    doc.moveDown();
    doc.text(`To,`);
    doc.text(employee.name);
    if (employee.employeecode) doc.text(`Employee ID: ${employee.employeecode}`);
    doc.moveDown();
    doc.text(
      `This is to certify that ${employee.name} was employed with AVGC Studios${
        employee.department ? ` in the ${employee.department} department` : ''
      }${employee.designation ? ` as ${employee.designation}` : ''}.`
    );
    doc.moveDown();
    doc.text(
      `Their last working day with the organization is recorded as ${lwd || 'as mutually agreed'}.`
    );
    doc.moveDown();
    doc.text(
      'We thank them for their contributions and wish them success in their future endeavours.'
    );
    doc.moveDown(2);
    doc.text('For AVGC Studios');
    doc.moveDown(2);
    doc.text('Human Resources');
  });

  return `/uploads/exit-letters/${fileName}`;
}

async function generateExperienceLetter(employee, exitRequest) {
  const lwd = exitRequest.confirmed_last_working_day || exitRequest.last_working_day;
  const joined = employee.createdat
    ? new Date(employee.createdat).toLocaleDateString('en-IN')
    : '—';
  const fileName = `experience-${employee.id}-${exitRequest.id}-${Date.now()}.pdf`;
  const filePath = path.join(lettersDir(), fileName);

  await writePdf(filePath, (doc) => {
    doc.fontSize(18).fillColor('#ed1d24').text('AVGC Studios', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor('#000').text('Experience Letter', { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    doc.moveDown();
    doc.text('To Whom It May Concern,');
    doc.moveDown();
    doc.text(
      `This is to certify that ${employee.name} (Employee ID: ${employee.employeecode || '—'}) was associated with AVGC Studios from ${joined} until ${lwd || 'separation'}.`
    );
    doc.moveDown();
    if (employee.designation) {
      doc.text(`During this period, they served as ${employee.designation}.`);
      doc.moveDown();
    }
    doc.text(
      'We found their conduct and performance to be satisfactory during their tenure with us.'
    );
    doc.moveDown();
    doc.text('We wish them the very best in their future career.');
    doc.moveDown(2);
    doc.text('For AVGC Studios');
    doc.moveDown(2);
    doc.text('Human Resources');
  });

  return `/uploads/exit-letters/${fileName}`;
}

module.exports = { generateRelievingLetter, generateExperienceLetter };
