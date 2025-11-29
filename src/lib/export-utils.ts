// PDF Export Utilities using dom-to-image-more for visual capture

// Markdown parsing for PDF
interface ParsedElement {
  type: 'heading' | 'bold' | 'bullet' | 'paragraph';
  text: string;
  size?: number;
}

function parseMarkdownForPDF(content: string, maxWidth: number): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      // Skip empty lines
      continue;
    }
    
    // Check for headings (##, ###, etc.)
    if (trimmedLine.startsWith('###')) {
      elements.push({
        type: 'heading',
        text: trimmedLine.replace(/^#+\s*/, ''),
        size: 11
      });
    } else if (trimmedLine.startsWith('##')) {
      elements.push({
        type: 'heading',
        text: trimmedLine.replace(/^#+\s*/, ''),
        size: 13
      });
    } else if (trimmedLine.startsWith('#')) {
      elements.push({
        type: 'heading',
        text: trimmedLine.replace(/^#+\s*/, ''),
        size: 15
      });
    }
    // Check for bullet points
    else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
      const bulletText = trimmedLine.replace(/^[-•]\s*/, '');
      // Remove markdown bold syntax and keep the text
      const cleanText = bulletText.replace(/\*\*(.+?)\*\*/g, '$1');
      elements.push({
        type: 'bullet',
        text: cleanText
      });
    }
    // Check for bold text (lines that are entirely bold)
    else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
      elements.push({
        type: 'bold',
        text: trimmedLine.replace(/\*\*/g, '')
      });
    }
    // Regular paragraph
    else {
      // Remove markdown bold syntax from paragraphs
      const cleanText = trimmedLine.replace(/\*\*(.+?)\*\*/g, '$1');
      elements.push({
        type: 'paragraph',
        text: cleanText
      });
    }
  }
  
  return elements;
}

function calculateContentHeight(elements: ParsedElement[]): number {
  let height = 0;
  
  for (const element of elements) {
    if (element.type === 'heading') {
      height += 8; // Heading height
    } else if (element.type === 'bold') {
      height += 6; // Bold text height
    } else if (element.type === 'bullet') {
      height += 6; // Bullet height
    } else if (element.type === 'paragraph') {
      height += 6; // Paragraph height
    }
  }
  
  return height;
}

export type ExportMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chartData?: any;
  chartConfig?: any;
  charts?: Array<{ chartData: any; chartConfig: any }>;
  tableData?: { rows: any[][]; columns: string[]; rowCount: number };
  datasets?: Array<{ id: string; queryData: { rows: any[][]; columns: string[]; rowCount: number }; sqlQuery: string }>;
};

// Utility to convert chart element to image
async function captureChartAsImage(element: HTMLElement): Promise<string> {
  try {
    // Dynamic import to avoid SSR issues
    const html2canvas = (await import('html2canvas')).default;

    // Find the inner chart content (SVG) to avoid capturing borders/shadows
    // The parent element has borders and shadows we don't want
    let targetElement: HTMLElement = element;

    // Try to find the ResponsiveContainer's inner div first
    const responsiveInner = element.querySelector('.recharts-responsive-container') as HTMLElement;
    if (responsiveInner) {
      targetElement = responsiveInner;
      console.log('📊 Found ResponsiveContainer');
    }

    // Ensure element is in viewport
    targetElement.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Wait for chart to render
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('📸 Capturing chart element:', {
      width: targetElement.offsetWidth,
      height: targetElement.offsetHeight,
      visible: targetElement.offsetWidth > 0 && targetElement.offsetHeight > 0,
      tagName: targetElement.tagName,
      className: targetElement.className
    });

    // Pre-scan for LAB colors to help debug
    const labElements = targetElement.querySelectorAll('*');
    let labColorFound = false;
    labElements.forEach((el: any) => {
      const computedStyle = window.getComputedStyle(el);
      ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'].forEach(prop => {
        const value = computedStyle.getPropertyValue(prop);
        if (value && value.includes('lab(')) {
          console.warn('⚠️ LAB color found before clone:', {
            element: el.tagName,
            property: prop,
            value: value,
            className: el.className
          });
          labColorFound = true;
        }
      });
    });

    if (labColorFound) {
      console.log('🔧 Will convert LAB colors in onclone callback');
    }

    const canvas = await html2canvas(targetElement, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: targetElement.offsetWidth,
      height: targetElement.offsetHeight,
      onclone: (clonedDoc) => {
        // Fix for LAB color space error - convert all LAB colors to RGB
        // This prevents html2canvas from trying to parse unsupported LAB color format
        console.log('🔧 onclone callback - Converting LAB colors...');
        let conversionsCount = 0;

        const allElements = clonedDoc.querySelectorAll('*');
        allElements.forEach((el: any) => {
          // Get computed style from the element in the cloned document
          const computedStyle = clonedDoc.defaultView?.getComputedStyle(el) || window.getComputedStyle(el);

          // Convert any LAB colors to RGB - check both inline and computed styles
          ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'].forEach(prop => {
            const inlineValue = el.style.getPropertyValue(prop);
            const computedValue = computedStyle.getPropertyValue(prop);

            // Check both inline and computed styles for LAB color
            if ((inlineValue && inlineValue.includes('lab(')) || (computedValue && computedValue.includes('lab('))) {
              conversionsCount++;
              console.log(`  ✓ Converting ${prop} on ${el.tagName}.${el.className || 'no-class'}`);

              // Replace LAB color with transparent or appropriate fallback
              if (prop === 'backgroundColor') {
                el.style.setProperty(prop, 'transparent', 'important');
              } else if (prop === 'fill' || prop === 'stroke') {
                // For SVG elements, keep the original color but force it to be parsed as RGB
                el.style.setProperty(prop, 'currentColor', 'important');
              } else {
                el.style.setProperty(prop, '#000000', 'important');
              }
            }
          });

          // Special handling for SVG elements
          if (el.tagName === 'svg' || el.tagName === 'path' || el.tagName === 'rect' || el.tagName === 'circle') {
            // Force all colors to use RGB format
            ['fill', 'stroke'].forEach(attr => {
              const attrValue = el.getAttribute(attr);
              if (attrValue && attrValue.includes('lab(')) {
                conversionsCount++;
                console.log(`  ✓ Converting ${attr} attribute on ${el.tagName}`);
                el.setAttribute(attr, 'currentColor');
              }
            });
          }
        });

        console.log(`✅ Converted ${conversionsCount} LAB colors to RGB`);
      },
    });

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    console.log('✅ Chart captured, data URL length:', dataUrl.length);
    return dataUrl;
  } catch (error) {
    console.error('❌ Error capturing chart:', error);
    return '';
  }
}


// Export as PDF
export async function exportAsPDF(
  messages: ExportMessage[],
  conversationTitle: string = 'AI Chat',
  onProgress?: (progress: string) => void
): Promise<void> {
  try {
    // Dynamic import for jsPDF to ensure client-side execution
    const { default: jsPDF } = await import('jspdf');

    onProgress?.('Initializing PDF...');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Professional Header
    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, 0, pageWidth, 35, 'F');

    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(conversationTitle, margin, 15);

    pdf.setDrawColor(59, 130, 246);
    pdf.setLineWidth(1);
    pdf.line(margin, 20, pageWidth - margin, 20);

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(203, 213, 225);
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    pdf.text(`Report Generated: ${dateStr}`, margin, 28);

    yPosition = 45;

    for (let index = 0; index < messages.length; index++) {
      const msg = messages[index];
      onProgress?.(`Processing message ${index + 1}/${messages.length}...`);

      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = margin;
      }

      if (msg.role === 'user') {
        const userLines = pdf.splitTextToSize(msg.content, maxWidth - 12);
        const contentHeight = (userLines.length * 5) + 8;

        pdf.setFillColor(59, 130, 246);
        pdf.rect(margin, yPosition, 3, contentHeight + 8, 'F');
        pdf.roundedRect(margin + 8, yPosition + 2, 30, 6, 1, 1, 'F');
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255);
        pdf.text(`Q${Math.floor(index / 2) + 1}`, margin + 12, yPosition + 6);

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(30, 41, 59);
        pdf.text(userLines, margin + 8, yPosition + 12);

        yPosition += contentHeight + 15;
      } else {
        // Parse markdown content for assistant messages
        const parsedContent = parseMarkdownForPDF(msg.content, maxWidth - 8);
        const answerContentHeight = calculateContentHeight(parsedContent);

        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(margin, yPosition, maxWidth, answerContentHeight + 8, 2, 2, 'F');

        // Render parsed markdown content
        let contentYPosition = yPosition + 8;
        for (const element of parsedContent) {
          if (contentYPosition > pageHeight - 40) {
            pdf.addPage();
            contentYPosition = margin + 8;
            pdf.setFillColor(248, 250, 252);
            pdf.roundedRect(margin, margin, maxWidth, pageHeight - (margin * 2), 2, 2, 'F');
          }

          if (element.type === 'heading') {
            pdf.setFontSize(element.size || 12);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(30, 41, 59);
            const lines = pdf.splitTextToSize(element.text, maxWidth - 12);
            pdf.text(lines, margin + 6, contentYPosition);
            contentYPosition += (lines.length * 5) + 4;
          } else if (element.type === 'bold') {
            pdf.setFontSize(9.5);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(30, 41, 59);
            const lines = pdf.splitTextToSize(element.text, maxWidth - 12);
            pdf.text(lines, margin + 6, contentYPosition);
            contentYPosition += (lines.length * 5) + 2;
          } else if (element.type === 'bullet') {
            pdf.setFontSize(9.5);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(51, 65, 85);
            const bulletText = '• ' + element.text;
            const lines = pdf.splitTextToSize(bulletText, maxWidth - 16);
            pdf.text(lines, margin + 8, contentYPosition);
            contentYPosition += (lines.length * 5) + 2;
          } else if (element.type === 'paragraph') {
            pdf.setFontSize(9.5);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(51, 65, 85);
            const lines = pdf.splitTextToSize(element.text, maxWidth - 12);
            pdf.text(lines, margin + 6, contentYPosition);
            contentYPosition += (lines.length * 5) + 3;
          }
        }

        yPosition = contentYPosition + 8;

        // Capture single chart
        if (msg.chartData && msg.chartConfig && !msg.charts) {
          onProgress?.(`Capturing chart for message ${index + 1}...`);
          const chartElement = document.querySelector(`[data-message-id="${msg.id}"] [data-chart]`) as HTMLElement;
          if (chartElement) {
            try {
              const chartImage = await captureChartAsImage(chartElement);
              if (chartImage && chartImage.length > 100) {
                // Check if we need a new page for chart + title + description
                const chartConfig = msg.chartConfig;
                const titleHeight = 6;
                const descriptionLines = chartConfig.description ? 
                  pdf.splitTextToSize(chartConfig.description, maxWidth - 8).length : 0;
                const descriptionHeight = descriptionLines * 4;
                const totalNeededHeight = titleHeight + descriptionHeight + 20;

                if (yPosition > pageHeight - totalNeededHeight - 50) {
                  pdf.addPage();
                  yPosition = margin;
                }

                // Add chart title
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(37, 99, 235);
                pdf.text(chartConfig.title || 'Visualization', margin + 3, yPosition);
                yPosition += 6;

                // Add chart description
                if (chartConfig.description) {
                  pdf.setFontSize(8.5);
                  pdf.setFont('helvetica', 'normal');
                  pdf.setTextColor(80, 90, 110);
                  const descLines = pdf.splitTextToSize(chartConfig.description, maxWidth - 8);
                  pdf.text(descLines, margin + 3, yPosition);
                  yPosition += (descLines.length * 4) + 4;
                }

                // Calculate proper aspect ratio for chart
                const chartAspectRatio = chartElement.offsetHeight / chartElement.offsetWidth;
                const chartWidthInPDF = maxWidth;
                const chartHeightInPDF = chartWidthInPDF * chartAspectRatio;

                // Check if we need a new page for the chart itself
                if (yPosition > pageHeight - chartHeightInPDF - 15) {
                  pdf.addPage();
                  yPosition = margin;
                }

                pdf.addImage(chartImage, 'PNG', margin, yPosition, chartWidthInPDF, chartHeightInPDF);
                yPosition += chartHeightInPDF + 8;
              }
            } catch (err) {
              console.error('❌ Failed to capture chart:', err);
            }
          }
        }

        // Capture multiple charts
        if (msg.charts && msg.charts.length > 0) {
          onProgress?.(`Capturing ${msg.charts.length} charts...`);
          const chartElements = document.querySelectorAll(`[data-message-id="${msg.id}"] [data-chart]`);

          for (let chartIdx = 0; chartIdx < chartElements.length && chartIdx < msg.charts.length; chartIdx++) {
            try {
              const chartElement = chartElements[chartIdx] as HTMLElement;
              const chartImage = await captureChartAsImage(chartElement);

              if (chartImage && chartImage.length > 100) {
                const chartConfig = msg.charts[chartIdx]?.chartConfig;
                const titleHeight = 6;
                const descriptionLines = chartConfig?.description ? 
                  pdf.splitTextToSize(chartConfig.description, maxWidth - 8).length : 0;
                const descriptionHeight = descriptionLines * 4;
                const totalNeededHeight = titleHeight + descriptionHeight + 20;

                // Check if we need a new page for this chart + title + description
                if (yPosition > pageHeight - totalNeededHeight - 50) {
                  pdf.addPage();
                  yPosition = margin;
                }

                // Add chart title
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(37, 99, 235);
                pdf.text(chartConfig?.title || `Visualization ${chartIdx + 1}`, margin + 3, yPosition);
                yPosition += 6;

                // Add chart description
                if (chartConfig?.description) {
                  pdf.setFontSize(8.5);
                  pdf.setFont('helvetica', 'normal');
                  pdf.setTextColor(80, 90, 110);
                  const descLines = pdf.splitTextToSize(chartConfig.description, maxWidth - 8);
                  pdf.text(descLines, margin + 3, yPosition);
                  yPosition += (descLines.length * 4) + 4;
                }

                // Calculate proper aspect ratio for chart
                const chartAspectRatio = chartElement.offsetHeight / chartElement.offsetWidth;
                const chartWidthInPDF = maxWidth;
                const chartHeightInPDF = chartWidthInPDF * chartAspectRatio;

                // Check if we need a new page for the chart itself
                if (yPosition > pageHeight - chartHeightInPDF - 15) {
                  pdf.addPage();
                  yPosition = margin;
                }

                pdf.addImage(chartImage, 'PNG', margin, yPosition, chartWidthInPDF, chartHeightInPDF);
                yPosition += chartHeightInPDF + 8;
              }
            } catch (err) {
              console.error(`❌ Failed to capture chart ${chartIdx + 1}:`, err);
            }
          }
        }

        // Professional Excel-like table
        if (msg.tableData && msg.tableData.rows.length > 0) {
          if (yPosition > pageHeight - 60) {
            pdf.addPage();
            yPosition = margin;
          }

          yPosition += 5;

          // Add note about Excel export
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 116, 139);
          pdf.setFillColor(241, 245, 249);
          pdf.roundedRect(margin, yPosition, maxWidth, 16, 1, 1, 'F');
          
          const noteTitle = 'Note: For better table visibility';
          const noteDescription = 'Download the table as Excel from the chat interface to view all columns and rows clearly.';
          
          pdf.setFont('helvetica', 'bold');
          pdf.text(noteTitle, margin + 3, yPosition + 4);
          
          pdf.setFont('helvetica', 'normal');
          const noteLines = pdf.splitTextToSize(noteDescription, maxWidth - 6);
          pdf.text(noteLines, margin + 3, yPosition + 9);
          yPosition += 18;

          const numCols = msg.tableData.columns.length;
          const colWidth = maxWidth / numCols;
          const rowHeight = 8;

          // Table border - outer frame
          pdf.setDrawColor(71, 85, 105); // slate-600
          pdf.setLineWidth(0.5);

          // Header row - Professional gradient effect
          pdf.setFillColor(71, 85, 105); // slate-600
          pdf.rect(margin, yPosition, maxWidth, rowHeight, 'F');

          // Header borders - vertical lines
          pdf.setDrawColor(100, 116, 139);
          pdf.setLineWidth(0.3);
          for (let i = 1; i < numCols; i++) {
            const x = margin + (i * colWidth);
            pdf.line(x, yPosition, x, yPosition + rowHeight);
          }

          // Header text
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.5);
          pdf.setTextColor(255, 255, 255);

          msg.tableData.columns.forEach((col: string, i: number) => {
            const x = margin + (i * colWidth);
            const colText = col.length > 20 ? col.substring(0, 17) + '...' : col;
            pdf.text(colText, x + 2, yPosition + 5.5);
          });
          yPosition += rowHeight;

          // Data rows with Excel-like grid
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          const rowsToShow = Math.min(30, msg.tableData.rows.length);

          for (let r = 0; r < rowsToShow; r++) {
            if (yPosition > pageHeight - 25) {
              pdf.addPage();
              yPosition = margin + 10;
            }

            // Zebra striping
            if (r % 2 === 0) {
              pdf.setFillColor(255, 255, 255);
            } else {
              pdf.setFillColor(248, 250, 252); // slate-50
            }
            pdf.rect(margin, yPosition, maxWidth, rowHeight, 'F');

            // Vertical grid lines (like Excel)
            pdf.setDrawColor(203, 213, 225); // slate-300
            pdf.setLineWidth(0.2);
            for (let i = 1; i < numCols; i++) {
              const x = margin + (i * colWidth);
              pdf.line(x, yPosition, x, yPosition + rowHeight);
            }

            // Horizontal grid line
            pdf.setDrawColor(226, 232, 240); // slate-200
            pdf.setLineWidth(0.15);
            pdf.line(margin, yPosition + rowHeight, margin + maxWidth, yPosition + rowHeight);

            // Cell data with proper alignment
            pdf.setTextColor(30, 41, 59); // slate-800
            const row = msg.tableData.rows[r];
            row.forEach((cell: any, i: number) => {
              const x = margin + (i * colWidth);
              let cellText = String(cell !== null && cell !== undefined ? cell : '');

              // Truncate long text
              if (cellText.length > 20) cellText = cellText.substring(0, 17) + '...';

              // Check if numeric for right alignment
              const isNumeric = !isNaN(parseFloat(cellText)) && isFinite(cellText as any);
              if (isNumeric) {
                // Right align numbers
                const textWidth = pdf.getTextWidth(cellText);
                pdf.text(cellText, x + colWidth - textWidth - 2, yPosition + 5.5);
              } else {
                // Left align text
                pdf.text(cellText, x + 2, yPosition + 5.5);
              }
            });
            yPosition += rowHeight;
          }

          // Outer border for the entire table
          pdf.setDrawColor(71, 85, 105);
          pdf.setLineWidth(0.5);
          const tableHeight = (rowsToShow + 1) * rowHeight;
          pdf.rect(margin, yPosition - tableHeight, maxWidth, tableHeight, 'S');

          // Footer if more rows
          if (msg.tableData.rows.length > 30) {
            yPosition += 4;
            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(margin, yPosition, maxWidth, 7, 1, 1, 'F');
            pdf.setFontSize(7);
            pdf.setTextColor(100, 116, 139);
            pdf.text(`Showing 30 of ${msg.tableData.rows.length} rows • ${msg.tableData.rows.length - 30} more available`, margin + 3, yPosition + 4.5);
            yPosition += 9;
          }

          yPosition += 10;
        }

        // Multiple datasets
        if (msg.datasets && msg.datasets.length > 0) {
          msg.datasets.forEach((dataset: any, dsIdx: number) => {
            // Add title for dataset
            if (yPosition > pageHeight - 40) {
              pdf.addPage();
              yPosition = margin;
            }

            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(30, 41, 59);
            pdf.text(`Dataset ${dsIdx + 1}`, margin, yPosition);
            yPosition += 6;
          });
        }
      }

      yPosition += 5;
    }

    onProgress?.('Saving PDF...');
    pdf.save(`${conversationTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`);
    onProgress?.('Complete!');
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}
