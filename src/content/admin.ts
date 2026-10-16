/**
 * Copy for the admin area (`/admin`) — .scratch/storefront-v2/issues/04-admin-gate.md, ADR-0008.
 * Internal screens for the operators, so no launch-blocking marking. Typed content file per
 * docs/agents/content-files.md; consumed by `src/pages/admin.astro`, `src/pages/admin/robos/*`,
 * `src/components/admin-header.astro` and `src/components/admin-robot-form.astro`.
 *
 * Tickets 05 (catalog) and 16 (dead letters) add their pages by appending to `adminSections`:
 * the header nav and the landing's link list both read it, so one entry wires both.
 */

import type { FieldErrorCode, FieldName } from '../modules/catalog/admin';
import { GALLERY_LIMITS, type GalleryErrorCode, type GalleryFlashKey } from '../modules/catalog/gallery';
import type { OfferName, RobotStatus } from '../modules/catalog/robots';

export type AdminLink = { label: string; href: string; description: string };

export const pageTitle = 'Administração';
export const pageDescription = 'Área restrita para gerenciar o catálogo e a operação.';

export const adminAreaLabel = 'Administração';
export const navLabel = 'Navegação da administração';
export const logoutLabel = 'Sair';

export const heading = 'Administração';
export const signedInAs = (email: string) => `Conectado como ${email}`;

export const homeLink = { label: 'Início', href: '/admin' } as const;

export const sectionsHeading = 'Atalhos';
export const adminSections: AdminLink[] = [
	{ label: 'Robôs', href: '/admin/robos', description: 'Criar, editar, publicar e arquivar os Robôs e seus preços.' },
	{ label: 'E-mails com falha', href: '/admin/emails', description: 'Mensagens que não foram enviadas e podem ser reenviadas.' },
	{ label: 'Catálogo público', href: '/catalog', description: 'Como os Robôs aparecem para os visitantes.' },
	{ label: 'Área do cliente', href: '/conta', description: 'A visão de um Cliente com Licenças.' },
];

/** The unresolved dead-letter count on the landing (`/admin`), linking to the list. */
export const deadLettersCount = (count: number) =>
	count === 0 ? 'Nenhum e-mail com falha pendente' : count === 1 ? '1 e-mail com falha pendente' : `${count} e-mails com falha pendentes`;

/** `/admin/emails` — unresolved and resolved dead letters (storefront-v2 16). */
export const emails = {
	pageTitle: 'E-mails com falha',
	pageDescription: 'E-mails que o Resend recusou e ficaram guardados para reenvio.',
	heading: 'E-mails com falha',
	intro: 'Cada item é uma mensagem que não saiu. Reenvie depois de corrigir a causa; o motivo é o que o Resend respondeu.',
	unresolvedHeading: 'Pendentes',
	resolvedHeading: 'Resolvidos',
	emptyUnresolved: 'Nenhum e-mail pendente.',
	emptyResolved: 'Nenhum e-mail resolvido ainda.',
	columns: { kind: 'Tipo', recipient: 'Destinatário', subject: 'Assunto', age: 'Há', attempts: 'Tentativas', error: 'Motivo' },
	resendLabel: 'Reenviar',
	notResendable: 'Sem corpo guardado; não pode ser reenviado.',
	resolvedAtLabel: 'Resolvido',
	flash: {
		ok: 'E-mail reenviado.',
		failed: 'O Resend recusou o reenvio de novo; o motivo foi atualizado.',
		busy: 'Houve uma tentativa agora há pouco; aguarde alguns segundos.',
		'already-resolved': 'Esse e-mail já foi reenviado.',
		'no-body': 'Esse e-mail foi guardado sem corpo e não pode ser reenviado.',
		'not-found': 'E-mail não encontrado.',
	},
} as const;

export type EmailsFlashKey = keyof typeof emails.flash;

/** A coarse, pt-BR age for the list: "menos de 1 min", "5 min", "3 h", "2 d". */
export function ageLabel(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return 'menos de 1 min';
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} h`;
	return `${Math.floor(hours / 24)} d`;
}

// ---------------------------------------------------------------------
// Catalog admin (/admin/robos) — storefront-v2 05
// ---------------------------------------------------------------------

export const robotsPageTitle = 'Robôs';
export const robotsPageDescription = 'Gerencie os Robôs do catálogo e suas Ofertas.';
export const robotsHeading = 'Robôs';
export const robotsIntro = 'Todos os Robôs, em qualquer status. Só os publicados aparecem para os visitantes.';
export const newRobotLabel = 'Novo Robô';
export const robotsEmpty = 'Nenhum Robô ainda. Crie o primeiro.';
export const backToListLabel = 'Voltar para a lista';

export const statusLabels: Record<RobotStatus, string> = {
	draft: 'Rascunho',
	available: 'Disponível',
	'coming-soon': 'Em breve',
	archived: 'Arquivado',
};
export const statusHints: Record<RobotStatus, string> = {
	draft: 'Só administradores veem, no catálogo, marcado como rascunho.',
	available: 'Público e à venda (precisa de ao menos uma Oferta).',
	'coming-soon': 'Público, sem preço e sem botão de compra.',
	archived: 'Fora do catálogo; compras antigas continuam valendo. Reversível.',
};

export const offerFieldLabels: Record<OfferName, string> = {
	one_time: 'Compra (Licença Perpétua)',
	annual: 'Anual',
};
export const notOffered = 'Não oferecida';
export const sortOrderColumn = 'Ordem';
export const offersColumn = 'Ofertas';
export const statusColumn = 'Status';
export const robotColumn = 'Robô';
export const editLabel = 'Editar';
export const viewPublicLabel = 'Ver no catálogo';
export const draftPreviewNote = 'Rascunhos aparecem no catálogo só para administradores, marcados como rascunho.';

/** One action button per status change offered on the list, by the Robô's current status. */
export type StatusAction = { to: RobotStatus; label: string };
export const statusActions: Record<RobotStatus, StatusAction[]> = {
	draft: [
		{ to: 'available', label: 'Publicar' },
		{ to: 'archived', label: 'Arquivar' },
	],
	available: [
		{ to: 'draft', label: 'Despublicar' },
		{ to: 'archived', label: 'Arquivar' },
	],
	'coming-soon': [
		{ to: 'available', label: 'Publicar' },
		{ to: 'draft', label: 'Despublicar' },
		{ to: 'archived', label: 'Arquivar' },
	],
	archived: [{ to: 'draft', label: 'Restaurar' }],
};

export const newRobotTitle = 'Novo Robô';
export const newRobotHeading = 'Novo Robô';
export const newRobotIntro = 'O Robô começa como rascunho: só você o vê, no catálogo, até publicá-lo.';
export const editRobotHeading = (name: string) => `Editar ${name}`;
export const createSubmitLabel = 'Criar Robô';
export const saveSubmitLabel = 'Salvar alterações';

export const sectionIdentity = 'Identificação';
export const sectionDetails = 'Detalhes';
export const sectionOffers = 'Ofertas e preços';
export const sectionPublishing = 'Publicação';

export const fieldLabels: Record<Exclude<FieldName, 'offers' | 'price_one_time' | 'price_annual'>, string> = {
	slug: 'Identificador (slug)',
	name: 'Nome',
	shortDescription: 'Descrição curta',
	longDescription: 'Descrição longa',
	strategyType: 'Tipo de estratégia',
	market: 'Mercado',
	perfil: 'Perfil',
	supportedCorretoras: 'Corretoras compatíveis',
	status: 'Status',
	sortOrder: 'Ordem na lista',
};
export const fieldHelp: Partial<Record<keyof typeof fieldLabels, string>> = {
	slug: 'Minúsculas, números e hífens (ex.: robo-tendencia). Aparece nos links de compra.',
	shortDescription: 'Uma frase, mostrada no cartão do catálogo.',
	longDescription: 'Texto completo, mostrado no "Saiba mais".',
	market: 'Separe por vírgula (ex.: Mini Índice, Mini Dólar).',
	perfil: 'Ex.: Conservador / Médio Prazo. Opcional.',
	supportedCorretoras: 'Separe por vírgula. Opcional.',
	sortOrder: 'Menor aparece primeiro. Vazio vale 0.',
};
export const slugLockedNote =
	'Este Robô já foi comprado: o identificador não pode mais mudar, porque as compras e os arquivos em robots/<slug>/ apontam para ele.';
export const slugRenameNote =
	'Ainda sem compras, dá para mudar o identificador. A galeria acompanha sozinha; se você já enviou arquivos para robots/<slug>/, mova-os junto.';

export const priceHelp =
	'Em reais, com vírgula ou ponto (ex.: 997,00). Deixe em branco para não oferecer. Preços novos valem só para compras novas.';
export const priceInputPrefix = 'R$';

export const formErrorsSummary = 'Corrija os campos destacados e tente de novo.';

const errorTexts: Record<FieldErrorCode, string> = {
	required: 'Campo obrigatório.',
	'too-long': 'Texto longo demais.',
	'too-many': 'Itens demais na lista.',
	'slug-format': 'Use só minúsculas, números e hífens, sem espaços (ex.: robo-tendencia).',
	'slug-reserved': 'Este identificador é reservado. Escolha outro.',
	'slug-taken': 'Já existe um Robô com este identificador.',
	'slug-locked': 'Este Robô já foi comprado: o identificador não pode mudar.',
	'invalid-status': 'Status inválido.',
	'invalid-number': 'Informe um número inteiro entre -9999 e 9999.',
	'price-invalid': 'Preço inválido. Use algo como 997,00.',
	'price-zero': 'O preço não pode ser R$ 0,00. Deixe o campo em branco para não oferecer esta Oferta.',
	'price-too-high': 'Preço alto demais (máximo R$ 100.000,00).',
	'offers-required': 'Um Robô disponível precisa de ao menos uma Oferta com preço.',
};
export const fieldErrorText = (code: FieldErrorCode): string => errorTexts[code];

/** Flash messages shown after a redirect (`?ok=`), keyed by what happened. */
export const flashTexts = {
	created: 'Robô criado como rascunho.',
	saved: 'Alterações salvas.',
	'status-draft': 'Robô despublicado: agora é um rascunho.',
	'status-available': 'Robô publicado.',
	'status-coming-soon': 'Robô marcado como em breve.',
	'status-archived': 'Robô arquivado.',
} as const;
/** The flash line for a `?ok=` value; null for an absent or unknown one. */
export const flashText = (param: string | null): string | null =>
	param !== null && Object.hasOwn(flashTexts, param) ? flashTexts[param as keyof typeof flashTexts] : null;

// ---------------------------------------------------------------------
// Robô gallery (edit page section) — .scratch/robot-gallery/spec.md
// ---------------------------------------------------------------------

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export const gallery = {
	heading: 'Galeria',
	intro:
		'Imagens e vídeos mostrados no "Saiba mais" do catálogo quando o Robô está publicado. Cada ação aqui salva na hora, separada do formulário acima.',
	count: (count: number, max: number) => `${count} de ${max} itens`,
	empty: 'Nenhum item ainda.',
	newRobotNote: 'A galeria aparece depois que o Robô é criado: crie o Robô e adicione imagens e vídeos na página de edição.',
	addImagesLabel: 'Adicionar imagens',
	addImagesHelp: (maxBytes: number, maxFiles: number) =>
		`JPEG, PNG, WebP ou AVIF, até ${megabytes(maxBytes)} cada, até ${maxFiles} por envio. As imagens não são redimensionadas.`,
	addImagesSubmit: 'Enviar imagens',
	fullNote: 'A galeria está cheia. Remova um item para adicionar outro.',
	imageAlt: (position: number) => `Imagem ${position}`,
	videoAlt: (position: number) => `Miniatura do vídeo ${position}`,
	videoBadge: 'Vídeo do YouTube',
	addVideoLabel: 'Adicionar vídeo do YouTube',
	addVideoHelp: 'Cole o link do vídeo (youtube.com/watch?v=..., youtu.be/..., /shorts/...). Só o vídeo é guardado, não o link.',
	addVideoPlaceholder: 'https://youtu.be/...',
	addVideoSubmit: 'Adicionar vídeo',
	captionLabel: 'Legenda (opcional)',
	captionHelp: (max: number) => `Até ${max} caracteres. Também é o texto alternativo para leitores de tela. Vazio remove.`,
	captionSubmit: 'Salvar legenda',
	moveUpLabel: 'Subir',
	moveDownLabel: 'Descer',
	moveUpLabelFor: (position: number) => `Mover o item ${position} para cima`,
	moveDownLabelFor: (position: number) => `Mover o item ${position} para baixo`,
	removeLabel: 'Remover',
	removeConfirmTitle: 'Remover este item?',
	removeConfirmMessage: 'O item sai da galeria e, se for uma imagem, o arquivo é apagado. Não dá para desfazer.',
	removeConfirmAccept: 'Remover',
	/** The readable page a no-JavaScript upload lands on when the request is over the ceiling. */
	tooLargePage: {
		title: 'Envio grande demais',
		backLabel: 'Voltar para a galeria',
	},
} as const;

const galleryErrorTexts: Record<GalleryErrorCode, string> = {
	'no-files': 'Escolha ao menos uma imagem para enviar.',
	'too-many-files': `Envie no máximo ${GALLERY_LIMITS.maxFilesPerRequest} imagens por vez.`,
	'file-too-large': `Uma das imagens passa de ${megabytes(GALLERY_LIMITS.maxImageBytes)}. Reduza o arquivo e tente de novo; nada foi enviado.`,
	'unsupported-type': 'Um dos arquivos não é uma imagem JPEG, PNG, WebP ou AVIF (SVG não é aceito). Nada foi enviado.',
	'unreadable-image': 'Um dos arquivos parece uma imagem, mas está incompleto ou corrompido. Nada foi enviado.',
	'gallery-full': `A galeria chegou ao limite de ${GALLERY_LIMITS.maxItems} itens; o que passou do limite não foi adicionado.`,
	'invalid-youtube-url': 'Link do YouTube inválido. Cole o link de um vídeo (youtube.com/watch?v=..., youtu.be/..., /shorts/...).',
	'caption-too-long': `A legenda pode ter até ${GALLERY_LIMITS.maxCaptionLength} caracteres.`,
	'request-too-large': `O envio passa do limite de ${GALLERY_LIMITS.maxFilesPerRequest} imagens de até ${megabytes(GALLERY_LIMITS.maxImageBytes)} cada. Envie menos arquivos ou arquivos menores.`,
	'not-found': 'Item não encontrado: talvez já tenha sido removido.',
};
/** The failure line for a gallery `?error=` value; null for an absent or unknown one. */
export const galleryErrorText = (param: string | null): string | null =>
	param !== null && Object.hasOwn(galleryErrorTexts, param) ? galleryErrorTexts[param as GalleryErrorCode] : null;

const galleryFlashTexts: Record<GalleryFlashKey, string> = {
	'gallery-added': 'Imagens adicionadas à galeria.',
	'gallery-removed': 'Item removido da galeria.',
	'gallery-video-added': 'Vídeo adicionado à galeria.',
	'gallery-caption-saved': 'Legenda salva.',
	'gallery-moved': 'Ordem da galeria atualizada.',
};
/** The success line for a gallery `?ok=` value; null for an absent or unknown one. */
export const galleryFlashText = (param: string | null): string | null =>
	param !== null && Object.hasOwn(galleryFlashTexts, param) ? galleryFlashTexts[param as GalleryFlashKey] : null;

/** Failed status changes (`?error=`). */
export const statusErrorTexts = {
	'offers-required': 'Não foi possível publicar: o Robô precisa de ao menos uma Oferta com preço. Edite-o e informe um preço.',
	'invalid-status': 'Status inválido.',
	'not-found': 'Robô não encontrado.',
} as const;
/** The failure line for a `?error=` value; null for an absent or unknown one. */
export const statusErrorText = (param: string | null): string | null =>
	param !== null && Object.hasOwn(statusErrorTexts, param) ? statusErrorTexts[param as keyof typeof statusErrorTexts] : null;
