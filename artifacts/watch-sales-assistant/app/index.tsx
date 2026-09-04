import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Debt, Reminder, useAssistant } from '@/context/AssistantContext';
import { getGetAssistantMemoryQueryKey, useGetAssistantMemory } from '@workspace/api-client-react';

type Tab = 'home' | 'reminders' | 'debts' | 'customers' | 'inventory';
type ModalType = 'reminder' | 'debt' | 'note' | 'customer' | 'watch' | null;

const formatMoney = (value: number) => `${value.toLocaleString('ar-DZ')} دج`;
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
};
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString();
};

function AppContent() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('home');
  const [modal, setModal] = useState<ModalType>(null);
  const [command, setCommand] = useState('');
  const [fieldOne, setFieldOne] = useState('');
  const [fieldTwo, setFieldTwo] = useState('');
  const [fieldThree, setFieldThree] = useState('');
  const [feedback, setFeedback] = useState('');
  const {
    reminders,
    debts,
    customers,
    watches,
    notes,
    addReminder,
    toggleReminder,
    deleteReminder,
    addDebt,
    toggleDebt,
    deleteDebt,
    addCustomer,
    addWatch,
    hydrateProducts,
    toggleWatch,
    addNote,
    deleteNote,
    hydrateFromServer,
  } = useAssistant();
  const { data: remoteMemory } = useGetAssistantMemory(
    { limit: 500 },
    { query: { staleTime: 10000, queryKey: getGetAssistantMemoryQueryKey({ limit: 500 }) } },
  );

  useEffect(() => {
    if (remoteMemory?.entries) hydrateFromServer(remoteMemory.entries);
  }, [hydrateFromServer, remoteMemory]);

  useEffect(() => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return;
    fetch(`https://${domain}/api/products`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('products request failed'))))
      .then((payload: { products?: Array<{ id: string; name: string; price: number; status: 'available' | 'sold'; description?: string; category?: string; stock?: number; imageFileId?: string }> }) => {
        hydrateProducts(payload.products ?? []);
      })
      .catch(() => undefined);
  }, [hydrateProducts]);

  const totalOwedToMe = debts
    .filter((item) => item.direction === 'owedToMe' && !item.settled)
    .reduce((total, item) => total + item.amount, 0);
  const totalIOwe = debts
    .filter((item) => item.direction === 'iOwe' && !item.settled)
    .reduce((total, item) => total + item.amount, 0);
  const openReminders = reminders.filter((item) => !item.completed);

  const resetModal = () => {
    setModal(null);
    setFieldOne('');
    setFieldTwo('');
    setFieldThree('');
  };

  const openModal = (type: Exclude<ModalType, null>) => {
    Keyboard.dismiss();
    setFeedback('');
    setModal(type);
  };

  const saveModal = () => {
    if (modal === 'reminder') {
      if (!fieldOne.trim()) return setFeedback('اكتب عنوان الموعد أولًا');
      addReminder({ title: fieldOne.trim(), date: fieldTwo.trim() || tomorrow(), detail: fieldThree.trim() });
      setFeedback('تم حفظ الموعد');
    } else if (modal === 'debt') {
      const amount = Number(fieldTwo.replace(/[^\d.]/g, ''));
      if (!fieldOne.trim() || !amount) return setFeedback('أدخل اسم الشخص والمبلغ');
      addDebt({
        person: fieldOne.trim(),
        amount,
        direction: fieldThree === 'iOwe' ? 'iOwe' : 'owedToMe',
        dueDate: undefined,
      });
      setFeedback('تم تسجيل الدين');
    } else if (modal === 'note') {
      if (!fieldOne.trim()) return setFeedback('اكتب الملاحظة أولًا');
      addNote(fieldOne.trim());
      setFeedback('حُفظت الملاحظة في ذاكرتك');
    } else if (modal === 'customer') {
      if (!fieldOne.trim()) return setFeedback('أدخل اسم العميل');
      addCustomer({ name: fieldOne.trim(), phone: fieldTwo.trim() });
      setFeedback('تمت إضافة العميل');
    } else if (modal === 'watch') {
      const price = Number(fieldTwo.replace(/[^\d.]/g, ''));
      if (!fieldOne.trim() || !price) return setFeedback('أدخل اسم الساعة وسعرها');
      addWatch({ name: fieldOne.trim(), price });
      setFeedback('تمت إضافة الساعة للمخزون');
    }
    setTimeout(resetModal, 650);
  };

  const executeCommand = () => {
    const value = command.trim();
    if (!value) return;
    const amountMatch = value.match(/(\d[\d\s.]*)/);
    const amount = amountMatch ? Number(amountMatch[1].replace(/[^\d]/g, '')) : 0;
    if (/ذكرني|موعد|اتصل|تابع/.test(value)) {
      const title = value.replace(/^ذكرني\s*(أن|بأن)?\s*/u, '').trim() || value;
      addReminder({ title, date: /غدًا|غدا/.test(value) ? tomorrow() : new Date().toISOString() });
      setFeedback('أضفتها إلى مواعيدك');
    } else if (/دين|لي عند|عليّ|علي /.test(value) && amount) {
      const person = value.replace(/.*?(على|من|لدى|لي عند)\s*/u, '').replace(amountMatch?.[0] ?? '', '').trim() || 'شخص غير مسمى';
      addDebt({ person, amount, direction: /عليّ|علي /.test(value) ? 'iOwe' : 'owedToMe' });
      setFeedback('سجلت الدين وتستطيع متابعته من قسم الديون');
    } else {
      addNote(value);
      setFeedback('حفظت ذلك في ذاكرتك');
    }
    setCommand('');
  };

  const deleteWithConfirm = (message: string, action: () => void) => {
    Alert.alert('تأكيد الحذف', message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: action },
    ]);
  };

  const renderReminder = (item: Reminder) => (
    <View key={item.id} style={[styles.listRow, item.completed && styles.completedRow]}>
      <Pressable testID={`reminder-toggle-${item.id}`} onPress={() => toggleReminder(item.id)} style={[styles.check, item.completed && styles.checkDone]}>
        {item.completed ? <Feather name="check" size={15} color={colors.primaryForeground} /> : null}
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, item.completed && styles.completedText]}>{item.title}</Text>
        <Text style={styles.rowMeta}>{formatDate(item.date)} {item.detail ? `· ${item.detail}` : ''}</Text>
      </View>
      <Pressable testID={`reminder-delete-${item.id}`} onPress={() => deleteWithConfirm('سيُحذف هذا الموعد نهائيًا.', () => deleteReminder(item.id))} style={styles.iconButton}>
        <Feather name="trash-2" size={17} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );

  const renderDebt = (item: Debt) => (
    <View key={item.id} style={[styles.listRow, item.settled && styles.completedRow]}>
      <Pressable testID={`debt-toggle-${item.id}`} onPress={() => toggleDebt(item.id)} style={[styles.moneyIcon, item.direction === 'iOwe' && styles.moneyIconWarm]}>
        <MaterialCommunityIcons name={item.settled ? 'check' : item.direction === 'iOwe' ? 'arrow-top-right' : 'arrow-bottom-left'} size={18} color={item.settled ? colors.primary : item.direction === 'iOwe' ? colors.destructive : colors.accentForeground} />
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, item.settled && styles.completedText]}>{item.person}</Text>
        <Text style={styles.rowMeta}>{item.direction === 'iOwe' ? 'عليّ' : 'لي عنده'} {item.settled ? '· تمت التسوية' : ''}</Text>
      </View>
      <Text style={[styles.amount, item.direction === 'iOwe' && styles.amountWarm]}>{formatMoney(item.amount)}</Text>
      <Pressable testID={`debt-delete-${item.id}`} onPress={() => deleteWithConfirm('سيُحذف هذا الدين نهائيًا.', () => deleteDebt(item.id))} style={styles.iconButton}>
        <Feather name="trash-2" size={17} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );

  const renderHome = () => (
    <>
      <LinearGradient colors={['#122941', '#1e4056']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.brandMark}><MaterialCommunityIcons name="watch-variant" size={22} color={colors.primary} /></View>
          <Text style={styles.heroDate}>{new Date().toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <View style={styles.liveDot} />
        </View>
        <Text style={styles.eyebrow}>مساحتك الهادئة للبيع والمتابعة</Text>
        <Text style={styles.heroTitle}>أهلًا بك، دع ذاكرتك تعمل عنك.</Text>
        <Text style={styles.heroSubtitle}>اكتب أي شيء وسأحفظه لك في المكان الصحيح.</Text>
        <View style={styles.commandBox}>
          <TextInput
            testID="assistant-command-input"
            value={command}
            onChangeText={setCommand}
            onSubmitEditing={executeCommand}
            placeholder="مثال: ذكرني غدًا بالاتصال بمحمد"
            placeholderTextColor="#9eabbc"
            returnKeyType="send"
            style={styles.commandInput}
          />
          <Pressable testID="assistant-command-send" onPress={executeCommand} style={styles.commandSend}>
            <Feather name="arrow-up" size={19} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </LinearGradient>
      {feedback ? <View style={styles.feedback}><Feather name="check-circle" size={16} color={colors.accentForeground} /><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
      <View style={styles.sectionHeading}>
        <View><Text style={styles.sectionKicker}>نظرة اليوم</Text><Text style={styles.sectionTitle}>كل ما يحتاج انتباهك</Text></View>
        <MaterialCommunityIcons name="chevron-left" size={25} color={colors.mutedForeground} />
      </View>
      <View style={styles.metricsGrid}>
        <Pressable onPress={() => setTab('reminders')} style={styles.metricCard}>
          <View style={[styles.metricIcon, styles.metricIconBlue]}><Feather name="calendar" size={18} color={colors.accentForeground} /></View>
          <Text style={styles.metricValue}>{openReminders.length}</Text>
          <Text style={styles.metricLabel}>مواعيد مفتوحة</Text>
          <Text style={styles.metricHint}>لا تدعها تفوتك</Text>
        </Pressable>
        <Pressable onPress={() => setTab('debts')} style={styles.metricCard}>
          <View style={[styles.metricIcon, styles.metricIconGold]}><MaterialCommunityIcons name="cash-multiple" size={19} color={colors.primaryForeground} /></View>
          <Text style={styles.metricValue}>{formatMoney(totalOwedToMe)}</Text>
          <Text style={styles.metricLabel}>مستحقاتك</Text>
          <Text style={styles.metricHint}>{formatMoney(totalIOwe)} عليك</Text>
        </Pressable>
      </View>
      <View style={styles.sectionHeading}><View><Text style={styles.sectionKicker}>إضافة سريعة</Text><Text style={styles.sectionTitle}>ماذا تريد أن تحفظ؟</Text></View></View>
      <View style={styles.quickGrid}>
        <QuickAction icon="calendar-plus" label="موعد" onPress={() => openModal('reminder')} styles={styles} colors={colors} />
        <QuickAction icon="cash-plus" label="دين" onPress={() => openModal('debt')} styles={styles} colors={colors} />
        <QuickAction icon="file-document-edit-outline" label="ملاحظة" onPress={() => openModal('note')} styles={styles} colors={colors} />
      </View>
      <View style={styles.sectionHeading}><View><Text style={styles.sectionKicker}>القادم</Text><Text style={styles.sectionTitle}>مواعيدك القريبة</Text></View><Pressable onPress={() => setTab('reminders')}><Text style={styles.linkText}>عرض الكل</Text></Pressable></View>
      {openReminders.slice(0, 3).map(renderReminder)}
      {!openReminders.length ? <EmptyState icon="calendar-blank-outline" title="لا توجد مواعيد بعد" detail="استخدم شريط المساعد أو أضف أول موعد." styles={styles} colors={colors} /> : null}
    </>
  );

  const renderSection = () => {
    if (tab === 'home') return renderHome();
    if (tab === 'reminders') return <SectionView title="المواعيد" kicker="مركز المتابعة" actionLabel="إضافة موعد" onAdd={() => openModal('reminder')} styles={styles} colors={colors}>{reminders.map(renderReminder)}{!reminders.length ? <EmptyState icon="calendar-blank-outline" title="ابدأ بتسجيل موعد" detail="أي متابعة مهمة تستحق مكانًا هنا." styles={styles} colors={colors} /> : null}</SectionView>;
    if (tab === 'debts') return <SectionView title="الديون" kicker="صورة مالية واضحة" actionLabel="تسجيل دين" onAdd={() => openModal('debt')} styles={styles} colors={colors}><View style={styles.debtSummary}><View><Text style={styles.summaryLabel}>لك عند العملاء</Text><Text style={styles.summaryAmount}>{formatMoney(totalOwedToMe)}</Text></View><View style={styles.summaryDivider} /><View><Text style={styles.summaryLabel}>عليك</Text><Text style={[styles.summaryAmount, styles.amountWarm]}>{formatMoney(totalIOwe)}</Text></View></View>{debts.map(renderDebt)}{!debts.length ? <EmptyState icon="cash-remove" title="لا توجد ديون مسجلة" detail="سجل أول دين وسيبقى أمامك حتى تتم تسويته." styles={styles} colors={colors} /> : null}</SectionView>;
    if (tab === 'customers') return <SectionView title="العملاء" kicker="علاقاتك في مكان واحد" actionLabel="عميل جديد" onAdd={() => openModal('customer')} styles={styles} colors={colors}>{customers.map((item) => <View key={item.id} style={styles.listRow}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text></View><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowMeta}>{item.phone || 'أضف رقم الهاتف للمتابعة'}</Text></View><Feather name="chevron-left" size={18} color={colors.mutedForeground} /></View>)}{!customers.length ? <EmptyState icon="account-group-outline" title="أضف أول عميل" detail="سجل بيانات العملاء لتتذكر تفضيلاتهم ومواعيد التواصل." styles={styles} colors={colors} /> : null}</SectionView>;
    return <SectionView title="المخزون" kicker="ساعاتك المعروضة للبيع" actionLabel="إضافة ساعة" onAdd={() => openModal('watch')} styles={styles} colors={colors}>{watches.map((item) => <View key={item.id} style={[styles.listRow, item.status === 'sold' && styles.completedRow]}><Pressable onPress={() => toggleWatch(item.id)} style={styles.watchIcon}><MaterialCommunityIcons name="watch" size={20} color={colors.primary} /></Pressable><View style={styles.rowBody}><Text style={[styles.rowTitle, item.status === 'sold' && styles.completedText]}>{item.name}</Text><Text style={styles.rowMeta}>{item.status === 'sold' ? 'تم البيع' : 'متاحة للبيع'}</Text></View><Text style={styles.amount}>{formatMoney(item.price)}</Text></View>)}{!watches.length ? <EmptyState icon="watch-variant" title="مخزونك فارغ" detail="أضف الساعات لتعرف ما هو متاح وما تم بيعه." styles={styles} colors={colors} /> : null}<View style={styles.notesSection}><Text style={styles.sectionKicker}>الذاكرة الحرة</Text><Text style={styles.sectionTitle}>ملاحظاتك المحفوظة</Text>{notes.slice(0, 5).map((item) => <View key={item.id} style={styles.noteRow}><MaterialCommunityIcons name="note-text-outline" size={19} color={colors.primary} /><Text style={styles.noteText}>{item.text}</Text><Pressable onPress={() => deleteWithConfirm('سيتم حذف هذه الملاحظة.', () => deleteNote(item.id))}><Feather name="x" size={16} color={colors.mutedForeground} /></Pressable></View>)}{!notes.length ? <Text style={styles.mutedBody}>ملاحظاتك من شريط المساعد ستظهر هنا.</Text> : null}</View></SectionView>;
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 10, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 98 }]} keyboardShouldPersistTaps="handled">
        {tab !== 'home' ? <View style={styles.pageTop}><View><Text style={styles.pageKicker}>مساعد الساعات</Text><Text style={styles.pageTitle}>{tab === 'reminders' ? 'المواعيد' : tab === 'debts' ? 'الديون' : tab === 'customers' ? 'العملاء' : 'المخزون'}</Text></View><View style={styles.smallMark}><MaterialCommunityIcons name="watch-variant" size={19} color={colors.primary} /></View></View> : null}
        {renderSection()}
      </ScrollView>
      <View style={[styles.bottomBar, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 8 }]}>
        <NavItem icon="home" label="الرئيسية" active={tab === 'home'} onPress={() => setTab('home')} styles={styles} colors={colors} />
        <NavItem icon="calendar" label="المواعيد" active={tab === 'reminders'} onPress={() => setTab('reminders')} styles={styles} colors={colors} />
        <NavItem icon="cash-multiple" label="الديون" active={tab === 'debts'} onPress={() => setTab('debts')} styles={styles} colors={colors} />
        <NavItem icon="account-group-outline" label="العملاء" active={tab === 'customers'} onPress={() => setTab('customers')} styles={styles} colors={colors} />
        <NavItem icon="watch-variant" label="المخزون" active={tab === 'inventory'} onPress={() => setTab('inventory')} styles={styles} colors={colors} />
      </View>
      <EntryModal modal={modal} fieldOne={fieldOne} fieldTwo={fieldTwo} fieldThree={fieldThree} feedback={feedback} setFieldOne={setFieldOne} setFieldTwo={setFieldTwo} setFieldThree={setFieldThree} onClose={resetModal} onSave={saveModal} styles={styles} colors={colors} />
    </View>
  );
}

function EntryModal({ modal, fieldOne, fieldTwo, fieldThree, feedback, setFieldOne, setFieldTwo, setFieldThree, onClose, onSave, styles, colors }: { modal: ModalType; fieldOne: string; fieldTwo: string; fieldThree: string; feedback: string; setFieldOne: (value: string) => void; setFieldTwo: (value: string) => void; setFieldThree: (value: string) => void; onClose: () => void; onSave: () => void; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof useColors> }) {
  if (!modal) return null;
  const config = {
    reminder: { title: 'موعد جديد', label: 'ما الذي يجب أن تتذكره؟', placeholder: 'اتصل بعميل بخصوص ساعة Seiko', second: 'التاريخ (اختياري)', third: 'تفصيل صغير (اختياري)' },
    debt: { title: 'تسجيل دين', label: 'اسم الشخص', placeholder: 'محمد بن علي', second: 'المبلغ بالدينار', third: '' },
    note: { title: 'ملاحظة جديدة', label: 'ماذا تريد ألا تنساه؟', placeholder: 'مقاس معصم الزبون أو فكرة للبيع...', second: '', third: '' },
    customer: { title: 'عميل جديد', label: 'اسم العميل', placeholder: 'الاسم الكامل', second: 'رقم الهاتف (اختياري)', third: '' },
    watch: { title: 'إضافة ساعة', label: 'الماركة والموديل', placeholder: 'Casio Vintage A168', second: 'سعر البيع بالدينار', third: '' },
  }[modal];
  return <Modal animationType="slide" transparent visible onRequestClose={onClose}><View style={styles.modalBackdrop}><KeyboardAwareScrollViewCompat bottomOffset={30} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalWrap}><View style={styles.modalCard}><View style={styles.modalHandle} /><View style={styles.modalHeader}><Text style={styles.modalTitle}>{config.title}</Text><Pressable testID="modal-close" onPress={onClose} style={styles.closeButton}><Feather name="x" size={20} color={colors.foreground} /></Pressable></View><Text style={styles.inputLabel}>{config.label}</Text><TextInput testID="entry-primary-input" value={fieldOne} onChangeText={setFieldOne} placeholder={config.placeholder} placeholderTextColor={colors.mutedForeground} style={styles.input} autoFocus />{config.second ? <><Text style={styles.inputLabel}>{config.second}</Text><TextInput testID="entry-secondary-input" value={fieldTwo} onChangeText={setFieldTwo} placeholder={modal === 'reminder' ? 'غدًا أو 26 أوت' : '0'} placeholderTextColor={colors.mutedForeground} style={styles.input} keyboardType={modal === 'debt' || modal === 'watch' ? 'numeric' : 'default'} /></> : null}{modal === 'debt' ? <><Text style={styles.inputLabel}>نوع الدين</Text><View style={styles.choiceRow}><Pressable onPress={() => setFieldThree('owedToMe')} style={[styles.choice, fieldThree !== 'iOwe' && styles.choiceSelected]}><Text style={[styles.choiceText, fieldThree !== 'iOwe' && styles.choiceTextSelected]}>لي عنده</Text></Pressable><Pressable onPress={() => setFieldThree('iOwe')} style={[styles.choice, fieldThree === 'iOwe' && styles.choiceSelected]}><Text style={[styles.choiceText, fieldThree === 'iOwe' && styles.choiceTextSelected]}>عليّ</Text></Pressable></View></> : null}{modal === 'reminder' ? <><Text style={styles.inputLabel}>{config.third}</Text><TextInput value={fieldThree} onChangeText={setFieldThree} placeholder="مثال: في المحل" placeholderTextColor={colors.mutedForeground} style={styles.input} /></> : null}{feedback ? <Text style={styles.errorText}>{feedback}</Text> : null}<Pressable testID="entry-save" onPress={onSave} style={styles.saveButton}><Text style={styles.saveText}>حفظ في ذاكرتي</Text><Feather name="arrow-left" size={18} color={colors.primaryForeground} /></Pressable></View></KeyboardAwareScrollViewCompat></View></Modal>;
}

function SectionView({ title, kicker, actionLabel, onAdd, children, styles, colors }: { title: string; kicker: string; actionLabel: string; onAdd: () => void; children: React.ReactNode; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof useColors> }) {
  return <><View style={styles.sectionHeading}><View><Text style={styles.sectionKicker}>{kicker}</Text><Text style={styles.sectionTitle}>{title}</Text></View><Pressable onPress={onAdd} style={styles.addButton}><Feather name="plus" size={16} color={colors.primaryForeground} /><Text style={styles.addButtonText}>{actionLabel}</Text></Pressable></View>{children}</>;
}

function QuickAction({ icon, label, onPress, styles, colors }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof useColors> }) {
  return <Pressable testID={`quick-${label}`} onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><View style={styles.quickIcon}><MaterialCommunityIcons name={icon} size={19} color={colors.primary} /></View><Text style={styles.quickLabel}>{label}</Text><Feather name="plus" size={15} color={colors.mutedForeground} /></Pressable>;
}

function EmptyState({ icon, title, detail, styles, colors }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; detail: string; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><MaterialCommunityIcons name={icon} size={26} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>;
}

function NavItem({ icon, label, active, onPress, styles, colors }: { icon: keyof typeof MaterialCommunityIcons.glyphMap | keyof typeof Feather.glyphMap; label: string; active: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof useColors> }) {
  return <Pressable testID={`nav-${label}`} onPress={onPress} style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}>{icon === 'home' || icon === 'calendar' ? <Feather name={icon as keyof typeof Feather.glyphMap} size={21} color={active ? colors.primary : colors.mutedForeground} /> : <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={21} color={active ? colors.primary : colors.mutedForeground} />}<Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text></Pressable>;
}

export default function Index() {
  return <AppContent />;
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 18 },
    hero: { borderRadius: 28, padding: 20, marginBottom: 18, overflow: 'hidden' },
    heroTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 28 },
    brandMark: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
    heroDate: { color: '#dce6eb', fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1, textAlign: 'right' },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#8fc8a2' },
    eyebrow: { color: '#c7d7df', fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'right', marginBottom: 7 },
    heroTitle: { color: '#fffdf8', fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 33, textAlign: 'right' },
    heroSubtitle: { color: '#b8c9d2', fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'right', marginTop: 5, marginBottom: 19 },
    commandBox: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 5 },
    commandInput: { flex: 1, color: '#fffdf8', fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'right', paddingHorizontal: 11, height: 41 },
    commandSend: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    feedback: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, marginBottom: 10 },
    feedbackText: { color: colors.accentForeground, fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'right' },
    sectionHeading: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14, marginBottom: 12 },
    sectionKicker: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'right', marginBottom: 3 },
    sectionTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'right' },
    metricsGrid: { flexDirection: 'row-reverse', gap: 11 },
    metricCard: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 19, padding: 14, minHeight: 133 },
    metricIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    metricIconBlue: { backgroundColor: colors.accent },
    metricIconGold: { backgroundColor: colors.primary },
    metricValue: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 21, textAlign: 'right', writingDirection: 'rtl' },
    metricLabel: { color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'right', marginTop: 2 },
    metricHint: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'right', marginTop: 4 },
    quickGrid: { flexDirection: 'row-reverse', gap: 9 },
    quickAction: { flex: 1, minHeight: 74, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 10, justifyContent: 'space-between' },
    quickIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    quickLabel: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'right' },
    linkText: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    listRow: { flexDirection: 'row-reverse', alignItems: 'center', minHeight: 69, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 9, gap: 10 },
    completedRow: { opacity: 0.62 },
    check: { width: 27, height: 27, borderRadius: 10, borderWidth: 1.5, borderColor: colors.input, alignItems: 'center', justifyContent: 'center' },
    checkDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    rowBody: { flex: 1 },
    rowTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'right' },
    rowMeta: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'right', marginTop: 4 },
    completedText: { textDecorationLine: 'line-through' },
    iconButton: { padding: 7 },
    moneyIcon: { width: 32, height: 32, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    moneyIconWarm: { backgroundColor: '#f5e2da' },
    amount: { color: colors.accentForeground, fontFamily: 'Inter_700Bold', fontSize: 12, textAlign: 'right' },
    amountWarm: { color: colors.destructive },
    debtSummary: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.secondary, borderRadius: 19, paddingVertical: 15, marginBottom: 14 },
    summaryLabel: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center' },
    summaryAmount: { color: colors.accentForeground, fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center', marginTop: 5 },
    summaryDivider: { width: 1, height: 35, backgroundColor: colors.border },
    pageTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
    pageKicker: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'right' },
    pageTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 28, textAlign: 'right', marginTop: 4 },
    smallMark: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    addButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: colors.primary, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12 },
    addButtonText: { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    empty: { alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 25, paddingVertical: 30, marginTop: 4 },
    emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
    emptyTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center' },
    emptyDetail: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', lineHeight: 19, marginTop: 5 },
    avatar: { width: 35, height: 35, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.accentForeground, fontFamily: 'Inter_700Bold', fontSize: 15 },
    watchIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    notesSection: { marginTop: 24, marginBottom: 10 },
    noteRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 13 },
    noteText: { flex: 1, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'right', lineHeight: 18 },
    mutedBody: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'right', marginTop: 10 },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row-reverse', justifyContent: 'space-around', alignItems: 'flex-start', paddingTop: 11, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
    navItem: { alignItems: 'center', minWidth: 56, gap: 4, paddingHorizontal: 4 },
    navLabel: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9 },
    navLabelActive: { color: colors.primary, fontFamily: 'Inter_700Bold' },
    pressed: { opacity: 0.72 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(9, 19, 32, 0.5)', justifyContent: 'flex-end' },
    modalWrap: { flexGrow: 1, justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.background, borderTopLeftRadius: 27, borderTopRightRadius: 27, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.input, alignSelf: 'center', marginBottom: 18 },
    modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    modalTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 21, textAlign: 'right' },
    closeButton: { width: 35, height: 35, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    inputLabel: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'right', marginBottom: 7, marginTop: 6 },
    input: { height: 50, borderWidth: 1, borderColor: colors.input, borderRadius: 14, backgroundColor: colors.card, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'right', paddingHorizontal: 14, marginBottom: 8 },
    choiceRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 13 },
    choice: { flex: 1, borderWidth: 1, borderColor: colors.input, borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
    choiceSelected: { backgroundColor: colors.accent, borderColor: colors.primary },
    choiceText: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12 },
    choiceTextSelected: { color: colors.accentForeground, fontFamily: 'Inter_700Bold' },
    errorText: { color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'right', marginBottom: 7 },
    saveButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 9, height: 51, borderRadius: 15, backgroundColor: colors.primary, marginTop: 6 },
    saveText: { color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 14 },
  });
}