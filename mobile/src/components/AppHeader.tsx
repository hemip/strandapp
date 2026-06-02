import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {GpsSnapshot} from '../types/basicData';

interface AppHeaderProps {
  gps: GpsSnapshot;
  lagnummer?: string;
  inventerare?: string;
  ruta?: string;
  provyta?: string;
  onPressMenu: () => void;
  onPressGps: () => void;
  onPressMap: () => void;
  onPressUser: () => void;
}

const STATUS_COLORS: Record<GpsSnapshot['status'], string> = {
  idle: '#8c7f70',
  searching: '#c58c1b',
  ok: '#2d7a48',
  permission_denied: '#a63a2b',
  unavailable: '#6d6d6d',
  error: '#a63a2b',
};

export function AppHeader({
  gps,
  lagnummer,
  inventerare,
  ruta,
  provyta,
  onPressMenu,
  onPressGps,
  onPressMap,
  onPressUser,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, {paddingTop: insets.top + 4}]}>
      <Pressable accessibilityLabel="Öppna meny" onPress={onPressMenu} style={styles.menuButton}>
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
      </Pressable>

      <View style={styles.titleGroup}>
        <Text style={styles.title}>Strand</Text>
        <Text style={styles.subtitle}>
          Lag: {lagnummer || '-'} | Inv: {inventerare || '-'} | Ruta: {ruta || '-'} | PY: {provyta || '-'}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <Pressable accessibilityLabel="Ändra lag och inventerare" onPress={onPressUser} style={styles.iconButton}>
          <View style={styles.userIconHead} />
          <View style={styles.userIconBody} />
        </Pressable>

        <Pressable accessibilityLabel="Visa karta" onPress={onPressMap} style={styles.iconButton}>
          <View style={styles.mapIconFrame}>
            <View style={styles.mapIconLineDiagonal} />
            <View style={styles.mapIconLineVertical} />
            <View style={styles.mapIconPin} />
          </View>
        </Pressable>

        <Pressable onPress={onPressGps} style={styles.gpsButton}>
          <View style={[styles.gpsDot, {backgroundColor: STATUS_COLORS[gps.status]}]} />
          <Text style={styles.gpsLabel}>GPS</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: '#f4efe7',
    borderBottomColor: '#d8ccbc',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  menuButton: {
    alignItems: 'center',
    backgroundColor: '#fffaf2',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginRight: 8,
    width: 44,
  },
  menuLine: {
    backgroundColor: '#213127',
    borderRadius: 1,
    height: 2,
    marginVertical: 3,
    width: 20,
  },
  titleGroup: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    color: '#14231a',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6f675c',
    fontSize: 13,
    marginTop: 4,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#fffaf2',
    borderColor: '#d8ccbc',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  userIconHead: {
    backgroundColor: '#213127',
    borderRadius: 6,
    height: 12,
    marginBottom: 2,
    width: 12,
  },
  userIconBody: {
    backgroundColor: '#213127',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    height: 9,
    width: 22,
  },
  mapIconFrame: {
    borderColor: '#213127',
    borderRadius: 3,
    borderWidth: 2,
    height: 24,
    overflow: 'hidden',
    width: 24,
  },
  mapIconLineDiagonal: {
    backgroundColor: '#213127',
    height: 2,
    left: -3,
    position: 'absolute',
    top: 12,
    transform: [{rotate: '-28deg'}],
    width: 32,
  },
  mapIconLineVertical: {
    backgroundColor: '#213127',
    height: 24,
    left: 8,
    opacity: 0.7,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  mapIconPin: {
    backgroundColor: '#2d7a48',
    borderColor: '#fffaf2',
    borderRadius: 4,
    borderWidth: 1,
    height: 8,
    position: 'absolute',
    right: 4,
    top: 5,
    width: 8,
  },
  gpsButton: {
    alignItems: 'center',
    backgroundColor: '#fffaf2',
    borderColor: '#d8ccbc',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  gpsDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  gpsLabel: {
    color: '#213127',
    fontSize: 11,
    fontWeight: '700',
  },
});
